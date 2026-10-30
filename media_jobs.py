"""Serialize native media tools and bound their per-process resources on Linux."""
import shutil
import subprocess
import sys
import threading

_condition=threading.Condition()
_busy=False
_waiting_uploads=0


def run(command, priority=False, **kwargs):
    global _busy,_waiting_uploads
    if sys.platform.startswith('linux') and shutil.which('prlimit'):
        command = ['prlimit','--as=536870912','--cpu=30','--'] + list(command)
    with _condition:
        if priority:_waiting_uploads+=1
        try:
            _condition.wait_for(lambda:not _busy and (priority or _waiting_uploads==0))
            _busy=True
        finally:
            if priority:_waiting_uploads-=1
    try:return subprocess.run(command, **kwargs)
    finally:
        with _condition:_busy=False;_condition.notify_all()
