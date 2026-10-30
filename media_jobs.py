"""Serialize native media tools and bound their per-process resources on Linux."""
import shutil
import subprocess
import sys
import threading

GATE = threading.BoundedSemaphore(1)


def run(command, **kwargs):
    if sys.platform.startswith('linux') and shutil.which('prlimit'):
        command = ['prlimit','--as=536870912','--cpu=30','--'] + list(command)
    with GATE:
        return subprocess.run(command, **kwargs)
