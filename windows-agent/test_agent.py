import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

AGENT_PATH = Path(__file__).with_name("agent.py")
spec = importlib.util.spec_from_file_location("print_agent", AGENT_PATH)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class DriverPrintTests(unittest.TestCase):
    def setUp(self):
        self.dc = Mock()
        self.dc.GetDeviceCaps.side_effect = lambda cap: {10: 203, 11: 203, 8: 576}[cap]
        self.dc.GetTextExtent.return_value = (50, 10)
        self.win32con = types.SimpleNamespace(LOGPIXELSX=10, LOGPIXELSY=11, HORZRES=8)
        self.win32print = types.SimpleNamespace(
            PRINTER_ENUM_LOCAL=2,
            PRINTER_ENUM_CONNECTIONS=4,
            EnumPrinters=Mock(return_value=[(0, 0, "Driver - Impressora Bematech MP-2800 TH", "LPT1:")]),
        )
        self.win32ui = types.SimpleNamespace(
            CreateDC=Mock(return_value=self.dc),
            CreateFont=Mock(side_effect=lambda attrs: attrs),
        )
        self.modules = {
            "win32con": self.win32con,
            "win32print": self.win32print,
            "win32ui": self.win32ui,
        }
        self.job = {"id": "test-1", "payload": {"title": "PEDIDO", "lines": [{"text": "2 x Açaí - R$ 20,00"}]}}
        self.config = {"printer_name": "Driver - Impressora Bematech MP-2800 TH"}

    def test_none_returns_are_accepted_without_none_integer_comparison(self):
        self.dc.StartDoc.return_value = None
        self.dc.EndDoc.return_value = None
        with patch.dict(sys.modules, self.modules):
            agent.print_with_driver(self.job, self.config)
        self.dc.StartDoc.assert_called_once()
        self.dc.EndDoc.assert_called_once()
        self.dc.DeleteDC.assert_called_once()

    def test_nonpositive_driver_return_raises_and_releases_context(self):
        self.dc.StartDoc.return_value = 0
        with patch.dict(sys.modules, self.modules):
            with self.assertRaisesRegex(RuntimeError, "não conseguiu iniciar"):
                agent.print_with_driver(self.job, self.config)
        self.dc.AbortDoc.assert_called_once()
        self.dc.DeleteDC.assert_called_once()

    def test_driver_exception_propagates_so_job_cannot_be_completed(self):
        self.dc.TextOut.side_effect = OSError("Windows spooler rejected document")
        with patch.dict(sys.modules, self.modules):
            with self.assertRaisesRegex(OSError, "spooler rejected"):
                agent.print_with_driver(self.job, self.config)
        self.dc.AbortDoc.assert_called_once()
        self.dc.DeleteDC.assert_called_once()


if __name__ == "__main__":
    unittest.main(verbosity=2)
