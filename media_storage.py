"""Delete the original and its derived files before purging the database record."""
from pathlib import Path
import shutil
import video_thumbnails


def _inside(root,value):
    path=(root/value).resolve()
    if not path.is_relative_to(root) or path==root:raise ValueError('Unsafe media path')
    return path


def remove_files(item,uploads):
    root=Path(uploads).resolve()
    filename=item.get('filename','')
    if not filename or Path(filename).name!=filename:raise ValueError('Invalid stored filename')
    relative=item.get('relative_url','')
    if not relative.startswith('/uploads/'):raise ValueError('Invalid stored media URL')
    target=_inside(root,relative.removeprefix('/uploads/'))
    if target.name=='index.m3u8':
        expected=_inside(root,'videos/'+Path(filename).stem)
        if target.parent!=expected:raise ValueError('Invalid derived media path')
        if expected.exists():shutil.rmtree(expected)
    elif target.is_file() or target.is_symlink():target.unlink(missing_ok=True)
    original=_inside(root,('videos/' if item['media_type']=='video' else 'images/')+filename)
    original.unlink(missing_ok=True)
    # Older HLS exports may retain a derived directory even after the URL moved.
    if item['media_type']=='video':
        derived=_inside(root,'videos/'+Path(filename).stem)
        if derived.is_dir():shutil.rmtree(derived)
    video_thumbnails.remove_thumbnail(item['id'])
    import clean_downloads
    clean_downloads.remove(item['id'])
