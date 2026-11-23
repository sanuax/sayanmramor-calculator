import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / 'scripts' / 'ci_weekly.py'


def stones(n):
    return {'stones': [{'id': f's{i}', 'name': f'S{i}', 'slabs': [[1]]} for i in range(n)]}


class GateFailedImagesTests(unittest.TestCase):
    def run_gate(self, failed_images):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / 'slabs.json').write_text(json.dumps(stones(100)), encoding='utf-8')
            (tmp / 'failed.txt').write_text('', encoding='utf-8')
            (tmp / 'img.txt').write_text(''.join(f'https://x/{i}\n' for i in range(failed_images)), encoding='utf-8')
            return subprocess.run(
                [sys.executable, str(SCRIPT), 'check', '--before', str(tmp / 'slabs.json'), '--after', str(tmp / 'slabs.json'),
                 '--failed', str(tmp / 'failed.txt'), '--failed-images', str(tmp / 'img.txt'),
                 '--attempted', '100', '--catalog', '100'],
                capture_output=True, text=True)

    def test_a_few_failed_photos_pass(self):
        self.assertEqual(self.run_gate(4).returncode, 0)

    def test_many_failed_photos_stop_the_run(self):
        result = self.run_gate(60)
        self.assertEqual(result.returncode, 1)
        self.assertIn('SAFETY GATE FAILED', result.stderr)


if __name__ == '__main__':
    unittest.main()
