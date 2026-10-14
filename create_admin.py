#!/usr/bin/env python3
"""
CLI Utility to safely create or reset an admin account directly on the server.
Usage:
    python3 create_admin.py <username> <password>
    or interactively:
    python3 create_admin.py
"""

import sys
import getpass
import re
import database


def main():
    database.init_db()
    if len(sys.argv) >= 3:
        username = sys.argv[1].strip()
        password = sys.argv[2]
    else:
        try:
            print("🔒 Creative Portfolio — Admin Account Setup")
            username = input("Enter admin username: ").strip()
            password = getpass.getpass("Enter admin password (min 6 chars): ")
            confirm = getpass.getpass("Confirm admin password: ")
            if password != confirm:
                print("❌ Passwords do not match.")
                sys.exit(1)
        except (KeyboardInterrupt, EOFError):
            print("\nAborted.")
            sys.exit(1)

    if len(username) < 3 or len(username) > 32 or not re.match(r"^[a-zA-Z0-9_\-\.]+$", username):
        print("❌ Username must be 3-32 characters (letters, numbers, _, -, .)")
        sys.exit(1)

    if len(password) < 6:
        print("❌ Password must be at least 6 characters.")
        sys.exit(1)

    existing = database.get_admin_by_username(username)
    if existing:
        print(f"⚠️  Admin '{username}' already exists. Updating password...")
        pwd_hash, salt = database.hash_password(password)
        with database.get_db() as conn:
            conn.execute("UPDATE admins SET password_hash = ?, salt = ? WHERE id = ?", (pwd_hash, salt, existing["id"]))
        print(f"✅ Password for admin '{username}' successfully updated.")
    else:
        admin = database.create_admin(username, password)
        print(f"✅ Admin account '{admin['username']}' created successfully (ID: {admin['id']}).")


if __name__ == "__main__":
    main()
