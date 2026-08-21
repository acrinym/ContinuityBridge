"""Tests for the portable client."""

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from desktop.continuity_bridge_desktop.portable_client import PortableClient


class TestPortableClient(unittest.TestCase):
    """Test the PortableClient class."""

    def setUp(self):
        """Set up test fixtures."""
        self.client = PortableClient()
        self.temp_dir = tempfile.mkdtemp()
        self.temp_path = Path(self.temp_dir)

    def tearDown(self):
        """Clean up test fixtures."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_encrypt_command_structure(self):
        """Test that encrypt command doesn't include passphrase in argv."""
        command, stdin_input = self.client.encrypt_command(
            input_path=str(self.temp_path / "input.md"),
            output_path=str(self.temp_path / "output.cbx"),
            passphrase="test-pass",
        )

        # Verify passphrase is NOT in command args
        command_str = " ".join(command)
        self.assertNotIn("test-pass", command_str)

        # Verify passphrase IS in stdin input
        self.assertIn("test-pass", stdin_input)

        # Verify passphrase-stdin flag is present
        self.assertIn("--passphrase-stdin", command)

    def test_encrypt_command_with_overwrite(self):
        """Test encrypt command with overwrite flag."""
        command, stdin_input = self.client.encrypt_command(
            input_path=str(self.temp_path / "input.md"),
            output_path=str(self.temp_path / "output.cbx"),
            passphrase="test-pass",
            overwrite=True,
        )

        self.assertIn("--overwrite", command)

    def test_inspect_command_structure(self):
        """Test that inspect command doesn't include passphrase in argv."""
        command, stdin_input = self.client.inspect_command(
            encrypted_path=str(self.temp_path / "encrypted.cbx"),
            passphrase="test-pass",
        )

        # Verify passphrase is NOT in command args
        command_str = " ".join(command)
        self.assertNotIn("test-pass", command_str)

        # Verify passphrase IS in stdin input
        self.assertIn("test-pass", stdin_input)

    def test_inspect_command_with_json(self):
        """Test inspect command with JSON output flag."""
        command, stdin_input = self.client.inspect_command(
            encrypted_path=str(self.temp_path / "encrypted.cbx"),
            passphrase="test-pass",
            json_output=True,
        )

        self.assertIn("--json", command)

    def test_restore_command_structure(self):
        """Test that restore command doesn't include passphrase in argv."""
        command, stdin_input = self.client.restore_command(
            encrypted_path=str(self.temp_path / "encrypted.cbx"),
            output_path=str(self.temp_path / "restored"),
            passphrase="test-pass",
        )

        # Verify passphrase is NOT in command args
        command_str = " ".join(command)
        self.assertNotIn("test-pass", command_str)

        # Verify passphrase IS in stdin input
        self.assertIn("test-pass", stdin_input)

    def test_restore_command_with_overwrite(self):
        """Test restore command with overwrite flag."""
        command, stdin_input = self.client.restore_command(
            encrypted_path=str(self.temp_path / "encrypted.cbx"),
            output_path=str(self.temp_path / "restored"),
            passphrase="test-pass",
            overwrite=True,
        )

        self.assertIn("--overwrite", command)

    def test_encrypt_requires_passphrase(self):
        """Test that encrypt requires passphrase."""
        with self.assertRaises(ValueError):
            self.client.encrypt_command(
                input_path=str(self.temp_path / "input.md"),
                output_path=str(self.temp_path / "output.cbx"),
                passphrase="",
            )

    def test_inspect_requires_passphrase(self):
        """Test that inspect requires passphrase."""
        with self.assertRaises(ValueError):
            self.client.inspect_command(
                encrypted_path=str(self.temp_path / "encrypted.cbx"),
                passphrase="",
            )

    def test_restore_requires_passphrase(self):
        """Test that restore requires passphrase."""
        with self.assertRaises(ValueError):
            self.client.restore_command(
                encrypted_path=str(self.temp_path / "encrypted.cbx"),
                output_path=str(self.temp_path / "restored"),
                passphrase="",
            )

    def test_encrypt_confirmation_in_stdin(self):
        """Test that encrypt sends two passphrases via stdin."""
        command, stdin_input = self.client.encrypt_command(
            input_path=str(self.temp_path / "input.md"),
            output_path=str(self.temp_path / "output.cbx"),
            passphrase="my-secret",
        )

        # Should have passphrase and confirmation
        lines = stdin_input.strip().split("\n")
        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0], "my-secret")
        self.assertEqual(lines[1], "my-secret")

    def test_inspect_single_passphrase_in_stdin(self):
        """Test that inspect sends single passphrase via stdin."""
        command, stdin_input = self.client.inspect_command(
            encrypted_path=str(self.temp_path / "encrypted.cbx"),
            passphrase="my-secret",
        )

        # Should have single passphrase
        lines = stdin_input.strip().split("\n")
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0], "my-secret")

    def test_restore_single_passphrase_in_stdin(self):
        """Test that restore sends single passphrase via stdin."""
        command, stdin_input = self.client.restore_command(
            encrypted_path=str(self.temp_path / "encrypted.cbx"),
            output_path=str(self.temp_path / "restored"),
            passphrase="my-secret",
        )

        # Should have single passphrase
        lines = stdin_input.strip().split("\n")
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0], "my-secret")


if __name__ == "__main__":
    unittest.main()
