#!/usr/bin/env python3
"""
Automated Verification Suite for Phase 7:
Tests the Private Cloud Server (FastAPI endpoints, WebSocket streaming,
TextRefiner formatting, and Wispr Flow API contract compatibility).
"""

import base64
import os
import sys
import unittest

# Add project root to sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "server"))

from src.refiner import TextRefiner

class TestPhase7Server(unittest.TestCase):

    def test_refiner_fillers(self):
        raw = "Um, I was thinking that, uh, we should deploy the server, you know."
        cleaned = TextRefiner.clean_fillers(raw)
        self.assertNotIn("um", cleaned.lower())
        self.assertNotIn("uh", cleaned.lower())
        self.assertNotIn("you know", cleaned.lower())

    def test_refiner_sentences_and_punctuation(self):
        raw = "first sentence. second sentence? third sentence"
        formatted = TextRefiner.format_sentences(raw)
        self.assertTrue(formatted.startswith("First"))
        self.assertIn("Second", formatted)
        self.assertIn("Third", formatted)
        self.assertTrue(formatted.endswith("."))

    def test_refiner_presets(self):
        # Raw preset
        raw_input = "  hello world  "
        self.assertEqual(TextRefiner.apply_preset(raw_input, "raw"), "hello world")

        # Code preset
        code_input = "const myVariable = 42"
        self.assertEqual(TextRefiner.apply_preset(code_input, "code"), "const myVariable = 42")

        # Casual preset
        casual_input = "yeah sounds great"
        self.assertEqual(TextRefiner.apply_preset(casual_input, "casual"), "Yeah sounds great")

    def test_fastapi_endpoints(self):
        from fastapi.testclient import TestClient
        from src.main import app

        client = TestClient(app)

        # 1. Health check
        res = client.get("/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertEqual(data.get("service"), "wisprflow-server")

        # 2. Transcription endpoint
        fake_audio = base64.b64encode(b"RIFF....WAVEfmt....datafake").decode("utf-8")
        payload = {
            "transcript_id": "test-uuid-server-1",
            "audio_base64": fake_audio,
            "duration_ms": 1500,
            "preset": "standard"
        }

        res = client.post("/v1/audio/transcriptions", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("status"), "ok")
        self.assertIn("formatted_text", data)
        self.assertGreater(data.get("num_words", 0), 0)
        self.assertIn("total_time", data)

        # 3. Wispr Flow alias endpoint
        res_alias = client.post("/llm/dictation", json=payload)
        self.assertEqual(res_alias.status_code, 200)

        # 4. Error validation
        res_bad = client.post("/v1/audio/transcriptions", json={"audio_base64": ""})
        self.assertEqual(res_bad.status_code, 400)

    def test_websocket_streaming(self):
        from fastapi.testclient import TestClient
        from src.main import app

        client = TestClient(app)

        with client.websocket_connect("/api/v1/meetings/transcribe") as ws:
            # Start stream
            ws.send_json({"type": "start", "preset": "standard"})

            # Stream audio bytes
            ws.send_bytes(b"\x00\x01\x02\x03" * 100)
            ack = ws.receive_json()
            self.assertEqual(ack.get("status"), "streaming")

            # Stop stream and get final transcript
            ws.send_json({"type": "stop"})
            final = ws.receive_json()
            self.assertEqual(final.get("status"), "ok")
            self.assertTrue(final.get("is_final"))
            self.assertIn("formatted_text", final)

if __name__ == "__main__":
    unittest.main()
