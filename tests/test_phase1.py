#!/usr/bin/env python3
"""
Automated Verification Suite for Phase 1:
- Validates client configuration schema & default server endpoints
- Verifies extracted audio, font, and icon assets
- Validates client & server package and deployment specifications
"""

import json
import os
import unittest
import yaml

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

class TestPhase1StructureAndConfig(unittest.TestCase):

    def test_client_config_validity(self):
        config_path = os.path.join(PROJECT_ROOT, "client", "config.json")
        self.assertTrue(os.path.isfile(config_path), f"Missing config file at {config_path}")
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        # Check server redirection settings
        self.assertIn("server", cfg)
        self.assertIn("api_base_url", cfg["server"])
        self.assertIn("websocket_url", cfg["server"])
        self.assertTrue(cfg["server"]["api_base_url"].startswith("http"))
        self.assertTrue(cfg["server"]["websocket_url"].startswith("ws"))

        # Check audio history retention requirement (10 audios)
        self.assertIn("history", cfg)
        self.assertEqual(cfg["history"]["max_audio_retention"], 10)
        self.assertTrue(cfg["history"]["store_raw_audio"])
        self.assertTrue(cfg["history"]["store_opus_chunks"])

        # Check hotkeys & UI
        self.assertIn("hotkeys", cfg)
        self.assertIn("push_to_talk", cfg["hotkeys"])
        self.assertIn("ui", cfg)
        self.assertTrue(cfg["ui"]["sound_effects_enabled"])
        self.assertTrue(cfg["ui"]["word_counter_animated"])

        # Check formatting presets
        self.assertIn("formatting", cfg)
        self.assertGreaterEqual(len(cfg["formatting"]["presets"]), 3)

    def test_client_package_json(self):
        pkg_path = os.path.join(PROJECT_ROOT, "client", "package.json")
        self.assertTrue(os.path.isfile(pkg_path), f"Missing package.json at {pkg_path}")
        with open(pkg_path, "r", encoding="utf-8") as f:
            pkg = json.load(f)
        self.assertEqual(pkg.get("name"), "wisprflow-linux")
        self.assertIn("dependencies", pkg)
        self.assertIn("devDependencies", pkg)

    def test_extracted_sound_assets(self):
        sounds_dir = os.path.join(PROJECT_ROOT, "client", "assets", "sounds")
        self.assertTrue(os.path.isdir(sounds_dir), f"Missing sounds directory at {sounds_dir}")
        required_sounds = [
            "dictation-start.wav",
            "dictation-stop.wav",
            "paste.wav",
            "Notification.wav"
        ]
        for sound in required_sounds:
            sound_file = os.path.join(sounds_dir, sound)
            self.assertTrue(os.path.isfile(sound_file), f"Missing sound asset: {sound}")
            self.assertGreater(os.path.getsize(sound_file), 1000, f"Sound asset {sound} is unexpectedly small")

    def test_extracted_icons_and_fonts(self):
        icons_dir = os.path.join(PROJECT_ROOT, "client", "assets", "icons")
        fonts_dir = os.path.join(PROJECT_ROOT, "client", "assets", "fonts")
        self.assertTrue(os.path.isdir(icons_dir), f"Missing icons dir at {icons_dir}")
        self.assertTrue(os.path.isdir(fonts_dir), f"Missing fonts dir at {fonts_dir}")
        self.assertGreater(len(os.listdir(icons_dir)), 10, "Icons directory should contain extracted SVGs")
        self.assertGreater(len(os.listdir(fonts_dir)), 2, "Fonts directory should contain extracted fonts")

    def test_server_scaffold(self):
        server_dir = os.path.join(PROJECT_ROOT, "server")
        req_file = os.path.join(server_dir, "requirements.txt")
        cfg_file = os.path.join(server_dir, "config.yaml")
        dockerfile = os.path.join(server_dir, "Dockerfile")
        compose_file = os.path.join(server_dir, "docker-compose.yml")

        self.assertTrue(os.path.isfile(req_file), "Missing server/requirements.txt")
        self.assertTrue(os.path.isfile(cfg_file), "Missing server/config.yaml")
        self.assertTrue(os.path.isfile(dockerfile), "Missing server/Dockerfile")
        self.assertTrue(os.path.isfile(compose_file), "Missing server/docker-compose.yml")

        # Validate config.yaml
        with open(cfg_file, "r") as f:
            server_cfg = yaml.safe_load(f)
        self.assertIn("server", server_cfg)
        self.assertIn("asr", server_cfg)

        # Validate Dockerfile content
        with open(dockerfile, "r") as f:
            df_content = f.read()
        self.assertIn("FROM python", df_content)
        self.assertIn("EXPOSE 8000", df_content)

        # Validate docker-compose.yml
        with open(compose_file, "r") as f:
            compose_cfg = yaml.safe_load(f)
        self.assertIn("services", compose_cfg)
        self.assertIn("wisprflow-server", compose_cfg["services"])

if __name__ == "__main__":
    unittest.main()
