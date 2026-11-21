"""
Wispr Flow Text Refiner
Cleans transcripts, adds punctuation, capitalizes sentences,
removes verbal fillers, and formats according to selected preset.
"""

import re

class TextRefiner:
    FILLERS = [
        r'\buh\b', r'\bum\b', r'\bah\b', r'\ber\b', r'\bhm\b',
        r'\bhmm\b', r'\byou know\b', r'\blike\s+like\b'
    ]

    @classmethod
    def clean_fillers(cls, text: str) -> str:
        cleaned = text
        for pattern in cls.FILLERS:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
        # Collapse multiple spaces
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        return cleaned

    @classmethod
    def format_sentences(cls, text: str) -> str:
        if not text:
            return ""

        # Capitalize first letter of every sentence
        sentences = re.split(r'([.?!]\s+)', text)
        formatted_pieces = []
        for piece in sentences:
            if piece and not re.match(r'^[.?!]\s+$', piece):
                piece = piece.strip()
                if piece:
                    piece = piece[0].upper() + piece[1:]
                formatted_pieces.append(piece)
            else:
                formatted_pieces.append(piece)

        result = ''.join(formatted_pieces)

        # Ensure sentence ends with period if missing
        if result and result[-1] not in '.?!':
            result += '.'

        return result

    @classmethod
    def apply_preset(cls, raw_text: str, preset: str = "standard") -> str:
        if not raw_text:
            return ""

        if preset == "raw":
            return raw_text.strip()

        cleaned = cls.clean_fillers(raw_text)

        if preset == "code":
            # Retain technical casing / remove excessive trailing periods for code fragments
            return cleaned

        if preset == "casual":
            # Friendly tone, remove trailing period if single phrase
            formatted = cls.format_sentences(cleaned)
            if formatted.count('.') == 1 and formatted.endswith('.'):
                formatted = formatted[:-1]
            return formatted

        # Standard preset (default)
        return cls.format_sentences(cleaned)
