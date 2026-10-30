import unittest
import tempfile
import os
import shutil
import importlib
import importlib.util

class FolderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Reload real database module because test_auth mocks sys.modules['database']
        spec = importlib.util.spec_from_file_location(
            "database_real",
            os.path.join(os.path.dirname(os.path.dirname(__file__)), "database.py")
        )
        cls.db = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.db)

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, 'test.db')
        self.db.DB_PATH = self.db_path
        self.db.init_db()

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def test_folder_crud(self):
        # 1. Create folder
        f1 = self.db.save_folder("Portraits")
        self.assertEqual(f1['name'], "Portraits")
        self.assertIsNotNone(f1['id'])

        # 2. Duplicate folder name rejected
        with self.assertRaises(ValueError):
            self.db.save_folder("portraits")

        # 3. Rename folder
        f1_renamed = self.db.save_folder("Portraits 2026", folder_id=f1['id'])
        self.assertEqual(f1_renamed['name'], "Portraits 2026")

        # 4. List folders
        folders = self.db.get_folders()
        self.assertEqual(len(folders), 1)
        self.assertEqual(folders[0]['name'], "Portraits 2026")
        self.assertEqual(folders[0]['item_count'], 0)

    def test_move_items_and_delete_preservation(self):
        f = self.db.save_folder("Landscape")
        f_id = f['id']

        m = self.db.create_media(
            title="Mountain", description="Snowy mountain", media_type="image",
            filename="mountain.jpg", relative_url="/uploads/images/mountain.jpg",
            file_size=1024, mime_type="image/jpeg"
        )
        p = self.db.create_poem(
            title="Wind", content="Blowing softly", mood="peaceful"
        )

        self.assertIsNone(m.get('folder_id'))
        self.assertIsNone(p.get('folder_id'))

        # Move both to folder
        moved = self.db.move_folder_items([
            {'kind': 'media', 'id': m['id']},
            {'kind': 'poem', 'id': p['id']}
        ], f_id)
        self.assertEqual(moved, 2)

        # Verify in folder
        folders = self.db.get_folders()
        self.assertEqual(folders[0]['item_count'], 2)

        m_updated = self.db.get_media_by_id(m['id'])
        p_updated = self.db.get_poem_by_id(p['id'])
        self.assertEqual(m_updated['folder_id'], f_id)
        self.assertEqual(p_updated['folder_id'], f_id)

        # Move items out back to main library (folder_id=None)
        moved_out = self.db.move_folder_items([
            {'kind': 'media', 'id': m['id']}
        ], None)
        self.assertEqual(moved_out, 1)
        m_unlinked = self.db.get_media_by_id(m['id'])
        self.assertIsNone(m_unlinked['folder_id'])

        # Move back to folder
        self.db.move_folder_items([{'kind': 'media', 'id': m['id']}], f_id)

        # Delete folder -> files must NOT be deleted, folder_id set to NULL
        self.db.delete_folder(f_id)
        self.assertEqual(len(self.db.get_folders()), 0)

        m_after = self.db.get_media_by_id(m['id'])
        p_after = self.db.get_poem_by_id(p['id'])
        self.assertIsNotNone(m_after)
        self.assertIsNotNone(p_after)
        self.assertIsNone(m_after['folder_id'])
        self.assertIsNone(p_after['folder_id'])

if __name__ == '__main__':
    unittest.main()
