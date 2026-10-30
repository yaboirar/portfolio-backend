#!/usr/bin/env python3
"""Local server console only: create an admin or reset its password."""
import os
import getpass
import sqlite3
import sys
import argparse

os.environ.setdefault('PUBLIC_ORIGIN', 'http://localhost:8000')

import database
import auth


def main():
    database.init_db()
    auth.init_auth()
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('username',nargs='?',help='Account name; prompted when omitted')
    args=parser.parse_args()
    username = (args.username or input('Username: ')).strip()
    password = getpass.getpass('Password (15–128 characters): ')
    if password != getpass.getpass('Confirm password: '):
        raise ValueError('Passwords do not match')
    auth.set_admin_password(username, password)
    print(f"Account '{username}' saved. Sign in on the website.")


if __name__ == '__main__':
    try:
        main()
    except (ValueError, sqlite3.Error, RuntimeError) as exc:
        raise SystemExit(str(exc))
