"""Opaque file storage: documents are never executed or served as active content."""
from pathlib import Path
import mimetypes,re

MAX_DOCUMENT_SIZE=500*1024**2

def extension(filename):
    if not isinstance(filename,str) or not filename or len(filename)>1000:raise ValueError('Invalid filename')
    suffix=Path(filename.replace('\\','/')).suffix.lower()
    if suffix and not re.fullmatch(r'\.[a-z0-9_-]{1,20}',suffix):raise ValueError('Unsupported filename extension')
    return suffix

def mime(filename):
    return mimetypes.guess_type(filename)[0] or 'application/octet-stream'
