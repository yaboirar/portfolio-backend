"""Bounded, single-file uploads built on Werkzeug's streaming multipart decoder."""
import os
import re

from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.http import parse_options_header
from werkzeug.sansio.multipart import (
    BLANK_LINE_RE, Data, Epilogue, Field, File, MultipartDecoder, NeedData, State,
)


class StrictDecoder(MultipartDecoder):
    """Require a complete closing delimiter line, including when split across reads."""
    def __init__(self, boundary, header_limit, **kwargs):
        super().__init__(boundary, **kwargs)
        self.header_limit = header_limit
        self._set_boundaries(False)

    def _set_boundaries(self, at_eof):
        line = rb'(?:\r\n|\n|\r)'
        ending = rb'(?:' + line + (rb'|\Z)' if at_eof else rb')')
        suffix = rb'(--[ \t]*' + ending + rb'|[ \t]*' + line + rb')'
        escaped = re.escape(self.boundary)
        self.boundary_re = re.compile(line + rb'--' + escaped + suffix)
        self.preamble_re = re.compile(line + rb'?--' + escaped + suffix)

    def receive_data(self, data):
        if data is None:
            self._set_boundaries(True)
        super().receive_data(data)

    def next_event(self):
        if self.state == State.PART:
            end = BLANK_LINE_RE.search(self.buffer)
            if (end.start() if end else len(self.buffer)) > self.header_limit:
                raise ValueError('Multipart part headers exceed maximum limit')
        return super().next_event()

    def _last_partial_boundary_index(self, data):
        # A closing delimiter now needs its line ending, so retain its extra
        # suffix too. Werkzeug's default retention only needs the boundary name.
        retain = max(0, len(data) - len(self.boundary) - 8)
        for prefix in (b'\r\n--' + self.boundary, b'\n--' + self.boundary,
                       b'\r--' + self.boundary):
            pos = data.rfind(prefix)
            if pos >= 0:
                suffix = data[pos + len(prefix):]
                if suffix.startswith(b'--'):
                    suffix = suffix[2:]
                if not suffix.strip(b' \t\r') or suffix == b'-':
                    retain = min(retain, pos)
        return min(super()._last_partial_boundary_index(data), retain)


def parse_upload(stream, content_type, content_length, output, *, video_exts,
                 image_exts, video_limit, image_limit, field_limit=10240,
                 header_limit=4096, part_limit=10, chunk_size=65536):
    """Consume exactly Content-Length; stream one file and return (fields, filename)."""
    kind, options = parse_options_header(content_type)
    boundary = options.get('boundary', '')
    if kind.lower() != 'multipart/form-data' or not boundary or len(boundary) > 70:
        raise ValueError('Expected multipart/form-data with a valid boundary')
    if content_length <= 0:
        raise ValueError('Empty or invalid request length')
    try:
        encoded = boundary.encode('ascii')
    except UnicodeEncodeError as exc:
        raise ValueError('Multipart boundary must be ASCII') from exc
    parser = StrictDecoder(encoded, header_limit, max_parts=part_limit,
                           max_form_memory_size=chunk_size * 2 + header_limit)
    fields = {}
    filename = None
    current = None
    field_data = bytearray()
    file_size = 0
    file_limit = 0
    remaining = content_length
    ended = False
    try:
        while True:
            event = parser.next_event()
            if isinstance(event, NeedData):
                if remaining:
                    chunk = stream.read(min(chunk_size, remaining))
                    if not chunk:
                        raise ConnectionResetError('Upload interrupted before declared body completed')
                    remaining -= len(chunk)
                    parser.receive_data(chunk)
                else:
                    parser.receive_data(None)
                continue
            if isinstance(event, (Field, File)):
                if not event.name:
                    raise ValueError('Multipart part is missing its field name')
                current = event
                field_data.clear()
                if isinstance(event, File):
                    if filename is not None:
                        raise ValueError('Multiple files not permitted. Upload files one at a time.')
                    filename = event.filename
                    ext = os.path.splitext(filename)[1].lower()
                    if ext not in video_exts | image_exts:
                        raise ValueError('Unsupported file format')
                    file_limit = video_limit if ext in video_exts else image_limit
            elif isinstance(event, Data):
                if isinstance(current, File):
                    file_size += len(event.data)
                    if file_size > file_limit:
                        raise ValueError('File exceeds maximum allowed size')
                    output.write(event.data)
                elif isinstance(current, Field):
                    if len(field_data) + len(event.data) > field_limit:
                        raise ValueError('Form field exceeds maximum allowed size')
                    field_data.extend(event.data)
                    if not event.more_data:
                        fields[current.name] = field_data.decode('utf-8', errors='strict').strip()
            elif isinstance(event, Epilogue):
                ended = True
                break
            # Consume epilogue without accumulating it, keeping request framing intact.
            if parser.state == State.EPILOGUE:
                parser.buffer.clear()
                while remaining:
                    chunk = stream.read(min(chunk_size, remaining))
                    if not chunk:
                        raise ConnectionResetError('Upload interrupted before declared body completed')
                    remaining -= len(chunk)
                parser.receive_data(None)
        if not ended or filename is None:
            raise ValueError('Malformed multipart: missing closing boundary or file')
        return fields, filename
    except RequestEntityTooLarge as exc:
        raise ValueError('Multipart request exceeds configured limits') from exc
    except ValueError as exc:
        if str(exc).startswith('Invalid form-data'):
            raise ValueError('Malformed multipart: missing closing boundary delimiter') from exc
        raise
