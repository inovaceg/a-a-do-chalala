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
        self.win32con = types.SimpleNamespace(LOGPIXELSX=10, LOGPIXELSY=11, HORZRES=8, ANTIALIASED_QUALITY=4)
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
        self.assertGreaterEqual(self.dc.Rectangle.call_count, 2)
        self.assertTrue(all(len(call.args) == 1 and isinstance(call.args[0], tuple) and len(call.args[0]) == 4 for call in self.dc.Rectangle.call_args_list))
        self.assertTrue(any(call.args[0].get("height", 0) >= int(203 * 22 / 72) for call in self.win32ui.CreateFont.call_args_list))
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

    def test_receipt_layout_includes_delivery_fields_and_wraps_long_values(self):
        receipt_job = {
            "id": "sample",
            "payload": {
                "title": "PEDIDO 42",
                "receipt": {
                    "orderNumber": "42",
                    "receiptNumber": "SALE-UUID-ORIGINAL",
                    "orderType": "DELIVERY",
                    "customer": "CLIENTE COM NOME COMPRIDO PARA QUEBRA DE LINHA",
                    "phone": "(32) 99999-0000",
                    "customerAddress": {
                        "street": "Rua das Palmeiras",
                        "number": "123, bloco 2, apartamento 304",
                        "neighborhood": "São Benedito",
                        "city": "Juiz de Fora/MG",
                        "complement": "Deixar na portaria ao lado da praça principal, entrada pelo portão azul",
                        "reference": "Portaria do bloco 2",
                        "postalCode": "36061-270",
                    },
                    "courier": {"name": "Entregador de teste", "phone": "(32) 98888-0000"},
                    "products": [{"name": "Produto com descrição propositalmente extensa para validar que nenhuma parte seja cortada na bobina", "quantity": 2, "line_total": 58, "extras": [{"name": "Leite Ninho extra", "price": 3}], "note": "Sem granola; confirmar entrega na portaria."}],
                    "payments": [{"method": "Dinheiro", "amount": 80}],
                    "subtotal": 70,
                    "discount": 2,
                    "fees": [{"label": "Taxa de entrega", "amount": 2}],
                    "total": 70,
                    "change": 10,
                },
            },
        }
        rows = agent.receipt_rows(receipt_job)
        texts = [row.get("text", "") for row in rows]
        self.assertTrue(any("DADOS DA ENTREGA" in text for text in texts))
        self.assertTrue(any("REFERÊNCIA: Portaria do bloco 2" in text for text in texts))
        self.assertTrue(any(row.get("kind") == "product" and row["quantity"] == "2x" for row in rows))
        self.assertTrue(any(row.get("text") == "AÇAÍ DO CHALALA" and row.get("size") == 22 and row.get("bold") for row in rows))
        self.assertTrue(any(row.get("kind") == "highlight" and row.get("text") == "PEDIDO Nº 42" and row.get("size") == 18 for row in rows))
        self.assertTrue(any(row.get("kind") == "total" and row.get("size") == 16 and row.get("bold") for row in rows))
        self.assertTrue(any(row.get("text") == "São Benedito - Juiz de Fora/MG" and row.get("align") == "center" for row in rows))
        wrapped = agent.split_to_width("Produto com uma descrição extensa e sem cortes", 12, len)
        self.assertGreater(len(wrapped), 1)
        self.assertEqual("".join(wrapped).replace(" ", ""), "Produtocomumadescriçãoextensaesemcortes")

    def test_non_delivery_omits_delivery_section_and_marks_counter(self):
        rows = agent.receipt_rows({"id": "sample", "payload": {"title": "PEDIDO 9", "receipt": {"orderNumber": "9", "orderType": "BALCÃO", "customer": "CLIENTE", "phone": "(32) 99999-0000", "products": []}}})
        texts = [row.get("text", "") for row in rows]
        self.assertIn("TIPO: BALCÃO", texts)
        self.assertIn("DADOS DO CLIENTE", texts)
        self.assertIn("CLIENTE: CLIENTE", texts)
        self.assertNotIn("DADOS DA ENTREGA", texts)


if __name__ == "__main__":
    unittest.main(verbosity=2)
