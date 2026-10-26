import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("acai_print_agent")

FUNCTION_URL = "https://ppthiahwsqoiefwcbstg.supabase.co/functions/v1/print-bridge"
PUBLISHABLE_KEY = "sb_publishable_dfqCLo8XzOi-9O5qkIhScw_fsm2UUdj"
CONFIG_PATH = Path(__file__).with_name("config.json")
TEST_DIR = Path(r"C:\ImpressaoAcai\Testes")


def load_config():
    if not CONFIG_PATH.exists():
        raise RuntimeError(f"Arquivo de configuração ausente: {CONFIG_PATH}")
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))
    if not config.get("agent_token"):
        raise RuntimeError("Preencha agent_token no config.json.")
    if config.get("mode") not in ("test", "production"):
        raise RuntimeError('mode deve ser "test" ou "production".')
    if config.get("print_method", "windows") not in ("windows", "raw"):
        raise RuntimeError('print_method deve ser "windows" ou "raw".')
    return config


def api(config, action, job_id=None, message=None):
    body = {"action": action}
    if job_id:
        body["jobId"] = job_id
    if message:
        body["message"] = message[:1000]
    response = requests.post(FUNCTION_URL, headers={"apikey": PUBLISHABLE_KEY, "x-agent-token": config["agent_token"]}, json=body, timeout=25)
    response.raise_for_status()
    return response.json()


def format_money(value):
    try:
        amount = float(value)
        return f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return str(value)


def format_datetime(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone().strftime("%d/%m/%Y %H:%M")
    except (TypeError, ValueError):
        return str(value)


def receipt_rows(job):
    payload = job["payload"]
    receipt = payload.get("receipt") or {}
    rows = [
        {"kind": "text", "text": "AÇAÍ DO CHALALA", "align": "center", "size": 22, "bold": True},
        {"kind": "text", "text": "O sabor que conquista!", "align": "center", "size": 10, "italic": True},
        {"kind": "text", "text": "R. Luís Marchini, 228", "align": "center", "size": 9},
        {"kind": "text", "text": "São Benedito - Juiz de Fora/MG", "align": "center", "size": 9},
        {"kind": "text", "text": "CEP 36061-270", "align": "center", "size": 9},
        {"kind": "divider"},
        {"kind": "text", "text": "COMPROVANTE DE PEDIDO", "align": "center", "size": 11, "bold": True},
        {"kind": "divider"},
        {"kind": "highlight", "text": f"PEDIDO Nº {receipt.get('orderNumber', payload.get('title', 'TESTE'))}", "align": "center", "size": 18, "bold": True},
        {"kind": "text", "text": f"DATA/HORA: {format_datetime(receipt.get('soldAt', payload.get('createdAt', datetime.now().isoformat())))}", "size": 8},
        {"kind": "text", "text": f"OPERADOR: {receipt.get('operator') or 'Caixa central'}", "size": 8},
        {"kind": "highlight", "text": f"TIPO: {receipt.get('orderType') or ('DELIVERY' if receipt.get('delivery') else 'BALCÃO')}", "align": "center", "size": 12, "bold": True},
    ]

    is_delivery = receipt.get("orderType") == "DELIVERY" or bool(receipt.get("delivery"))
    if not is_delivery and (receipt.get("customer") or receipt.get("phone")):
        rows.extend([{"kind": "divider"}, {"kind": "section", "text": "DADOS DO CLIENTE", "size": 10, "bold": True}])
        if receipt.get("customer"):
            rows.append({"kind": "text", "text": f"CLIENTE: {receipt['customer']}", "size": 8})
        if receipt.get("phone"):
            rows.append({"kind": "text", "text": f"TELEFONE: {receipt['phone']}", "size": 8})

    if is_delivery:
        rows.extend([{"kind": "divider"}, {"kind": "section", "text": "DADOS DA ENTREGA", "size": 10, "bold": True}])
        if receipt.get("customer"):
            rows.append({"kind": "text", "text": f"CLIENTE: {receipt['customer']}", "size": 8})
        if receipt.get("phone"):
            rows.append({"kind": "text", "text": f"TELEFONE: {receipt['phone']}", "size": 8})
        address = receipt.get("customerAddress")
        if isinstance(address, dict):
            address_parts = [address.get("street"), address.get("number"), address.get("neighborhood"), address.get("city"), f"CEP {address['postalCode']}" if address.get("postalCode") else None]
            structured_address = ", ".join(str(part) for part in address_parts if part)
            address_text = structured_address or receipt.get("deliveryAddress")
            if address_text:
                rows.append({"kind": "text", "text": f"ENDEREÇO: {address_text}", "size": 8})
            if address.get("complement"):
                rows.append({"kind": "text", "text": f"COMPLEMENTO: {address['complement']}", "size": 8})
            if address.get("reference"):
                rows.append({"kind": "text", "text": f"REFERÊNCIA: {address['reference']}", "size": 8})
        elif address or receipt.get("deliveryAddress"):
            rows.append({"kind": "text", "text": f"ENDEREÇO: {receipt.get('deliveryAddress') or address}", "size": 8})
        if receipt.get("reference"):
            rows.append({"kind": "text", "text": f"REFERÊNCIA: {receipt['reference']}", "size": 8})
        courier = receipt.get("courier")
        if isinstance(courier, dict) and courier.get("name"):
            courier_text = courier["name"] + (f" · {courier['phone']}" if courier.get("phone") else "")
            rows.append({"kind": "text", "text": f"ENTREGADOR: {courier_text}", "size": 8})
        elif courier:
            rows.append({"kind": "text", "text": f"ENTREGADOR: {courier}", "size": 8})

    rows.extend([{"kind": "divider"}, {"kind": "section", "text": "ITENS DO PEDIDO", "size": 10, "bold": True}])
    products = receipt.get("products", [])
    if products:
        for product in products:
            rows.append({"kind": "product", "quantity": f"{product.get('quantity', 1)}x", "description": str(product.get("name", "Produto")), "value": format_money(product.get("line_total", product.get("unit_price", 0))), "size": 9})
            for extra in product.get("extras", []):
                extra_text = f"  + {extra.get('name', '')}"
                if extra.get("price") is not None:
                    extra_text += f" ({format_money(extra['price'])})"
                rows.append({"kind": "text", "text": extra_text, "size": 8})
            if product.get("note"):
                rows.append({"kind": "text", "text": f"  Obs: {product['note']}", "size": 8, "italic": True})
    else:
        for line in payload.get("lines", []):
            if isinstance(line, dict):
                rows.append({"kind": "text", "text": str(line.get("text", "")), "size": 8, "bold": bool(line.get("bold"))})

    rows.append({"kind": "divider"})
    subtotal = receipt.get("subtotal")
    if subtotal is not None:
        rows.append({"kind": "text", "text": f"SUBTOTAL: {format_money(subtotal)}", "size": 8})
    for fee in receipt.get("fees", []):
        label = fee.get("label") or fee.get("name") or "TAXA"
        rows.append({"kind": "text", "text": f"{label.upper()}: {format_money(fee.get('amount', 0))}", "size": 8})
    if receipt.get("discount"):
        rows.append({"kind": "text", "text": f"DESCONTO: -{format_money(receipt['discount'])}", "size": 8})
    for payment in receipt.get("payments", []):
        rows.append({"kind": "text", "text": f"PAGAMENTO: {payment.get('method', '')}  {format_money(payment.get('amount', ''))}", "size": 8})
    if receipt.get("change"):
        rows.append({"kind": "text", "text": f"TROCO: {format_money(receipt['change'])}", "size": 8})
    if receipt.get("total") is not None:
        rows.append({"kind": "total", "text": f"TOTAL  {format_money(receipt['total'])}", "align": "right", "size": 16, "bold": True})
    rows.extend([
        {"kind": "divider"},
        {"kind": "text", "text": "OBRIGADO PELA PREFERÊNCIA!", "align": "center", "size": 9, "bold": True},
        {"kind": "text", "text": "AÇAÍ DO CHALALA", "align": "center", "size": 9, "bold": True},
        {"kind": "text", "text": "VOLTE SEMPRE!", "align": "center", "size": 8},
    ])
    return rows


def split_to_width(text, max_width, measure):
    result = []
    for original_line in str(text).splitlines() or [""]:
        words = original_line.split()
        line = ""
        for word in words:
            candidate = f"{line} {word}".strip()
            if measure(candidate) <= max_width:
                line = candidate
                continue
            if line:
                result.append(line)
                line = ""
            while measure(word) > max_width:
                cut = 1
                while cut < len(word) and measure(word[:cut + 1]) <= max_width:
                    cut += 1
                result.append(word[:cut])
                word = word[cut:]
            line = word
        if line:
            result.append(line)
    return result or [""]


def make_test_pdf(job):
    from reportlab.lib.units import mm
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas

    TEST_DIR.mkdir(parents=True, exist_ok=True)
    output = TEST_DIR / f"{job['id']}.pdf"
    rows = receipt_rows(job)
    width, margin = 80 * mm, 3 * mm
    prepared = []
    for row in rows:
        if row["kind"] == "divider":
            from reportlab.pdfbase.pdfmetrics import stringWidth
            dash_width = max(0.1, stringWidth("-", "Helvetica", 7))
            prepared.append((row, "-" * max(1, int((width - 2 * margin) / dash_width)), 7))
        elif row["kind"] == "product":
            font = "Helvetica-Bold"
            size = row["size"]
            description = simpleSplit(row["description"], font, size, width - 31 * mm)
            prepared.append((row, description, size))
        else:
            font = "Helvetica-Bold" if row.get("bold") else "Helvetica-Oblique" if row.get("italic") else "Helvetica"
            size = row.get("size", 8)
            prepared.append((row, simpleSplit(row["text"], font, size, width - 2 * margin), size))
    height = max(45 * mm, (sum((len(value) if isinstance(value, list) else 1) * (size * 1.45 + 1.5) for _, value, size in prepared) + 12) * mm / 2.83465)
    pdf = canvas.Canvas(str(output), pagesize=(width, height))
    y = height - margin
    for row, value, size in prepared:
        if row["kind"] == "divider":
            pdf.setFont("Helvetica", size)
            pdf.drawCentredString(width / 2, y, value)
        elif row["kind"] == "product":
            pdf.setFont("Helvetica-Bold", size)
            lines = value
            pdf.drawString(margin, y, row["quantity"])
            for index, line in enumerate(lines):
                pdf.drawString(margin + 9 * mm, y - index * (size * 1.45 + 1.5), line)
            pdf.drawRightString(width - margin, y, row["value"])
            y -= max(1, len(lines)) * (size * 1.45 + 1.5)
            continue
        elif row["kind"] in ("highlight", "total"):
            block_height = (len(value) if isinstance(value, list) else 1) * (size * 1.45 + 1.5)
            pdf.rect(margin, y - block_height + 2, width - 2 * margin, block_height)
            pdf.setFont("Helvetica-Bold", size)
            for index, line in enumerate(value):
                pdf.drawCentredString(width / 2, y - index * (size * 1.45 + 1.5), line)
            y -= block_height + 3
            continue
        elif row["kind"] == "section":
            pdf.setFont("Helvetica-Bold", size)
            pdf.drawString(margin, y, row["text"])
            pdf.line(margin, y - 2, width - margin, y - 2)
            y -= size * 1.45 + 3
            continue
        else:
            pdf.setFont("Helvetica-Bold" if row.get("bold") else "Helvetica-Oblique" if row.get("italic") else "Helvetica", size)
            for index, line in enumerate(value):
                line_y = y - index * (size * 1.45 + 1.5)
                if row.get("align") == "center":
                    pdf.drawCentredString(width / 2, line_y, line)
                elif row.get("align") == "right":
                    pdf.drawRightString(width - margin, line_y, line)
                else:
                    pdf.drawString(margin, line_y, line)
        y -= (len(value) if isinstance(value, list) else 1) * (size * 1.45 + 1.5)
    pdf.save()
    return output


def print_with_driver(job, config):
    import win32con
    import win32print
    import win32ui

    printer_name = config.get("printer_name", "Driver - Impressora Bematech MP-2800 TH")
    logger.info("Iniciando impressão via driver Windows: job=%s printer=%s", job.get("id"), printer_name)
    printers = [printer[2] for printer in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    if printer_name not in printers:
        raise RuntimeError(f'Impressora "{printer_name}" não encontrada. Impressoras disponíveis: {", ".join(printers)}')

    dc = win32ui.CreateDC()
    dc.CreatePrinterDC(printer_name)
    dpi_x = dc.GetDeviceCaps(win32con.LOGPIXELSX)
    dpi_y = dc.GetDeviceCaps(win32con.LOGPIXELSY)
    page_width = dc.GetDeviceCaps(win32con.HORZRES)
    if dpi_x <= 0 or dpi_y <= 0 or page_width <= 0:
        dc.DeleteDC()
        raise RuntimeError(f"O driver retornou dimensões imprimíveis inválidas: largura={page_width}, dpi={dpi_x}x{dpi_y}.")
    width_mm = page_width * 25.4 / dpi_x
    side_margin = max(1, int(dpi_x * 0.8 / 25.4))
    printable_width = page_width - 2 * side_margin
    rows = receipt_rows(job)
    logger.info("Área imprimível reportada pelo driver: %.1f mm (%s dots), resolução %s x %s dpi", width_mm, page_width, dpi_x, dpi_y)

    def select_font(row):
        size = row.get("size", 8)
        font = win32ui.CreateFont({"name": "Arial", "height": max(1, int(dpi_y * size / 72)), "weight": 700 if row.get("bold") else 400, "italic": row.get("italic", False), "quality": win32con.ANTIALIASED_QUALITY})
        dc.SelectObject(font)
        return size

    def draw_centered(text, y, width=printable_width):
        text_width = dc.GetTextExtent(text)[0]
        dc.TextOut(max(side_margin, (page_width - text_width) // 2), y, text)

    def draw_rule(y):
        rule_font = win32ui.CreateFont({"name": "Arial", "height": max(1, int(dpi_y * 6 / 72))})
        dc.SelectObject(rule_font)
        dash_width = max(1, dc.GetTextExtent("-")[0])
        dash_count = max(1, min(160, printable_width // dash_width))
        rule = "-" * dash_count
        draw_centered(rule, y)
        return y + int(dpi_y * 0.10)

    try:
        start_result = dc.StartDoc(f"Acai Chalala {job['id']}")
        if start_result is not None and start_result <= 0:
            raise RuntimeError(f"O Windows não conseguiu iniciar o documento (retorno {start_result!r}).")
        dc.StartPage()
        y = int(dpi_y * 0.08)
        for row in rows:
            kind = row["kind"]
            if kind == "divider":
                y = draw_rule(y)
                continue
            size = select_font(row)
            line_height = max(int(dpi_y * size / 72 * 1.25), dc.GetTextExtent("Ag")[1] + 1)
            if kind in ("highlight", "section", "total"):
                lines = split_to_width(row["text"], printable_width - int(dpi_x * 3 / 25.4), lambda text: dc.GetTextExtent(text)[0])
                padding_y = max(2, int(dpi_y * 0.7 / 25.4))
                box_height = len(lines) * line_height + 2 * padding_y
                dc.Rectangle((side_margin, y, page_width - side_margin, y + box_height))
                for index, line in enumerate(lines):
                    draw_centered(line, y + padding_y + index * line_height)
                y += box_height + int(dpi_y * (0.8 if kind == "total" else 0.45) / 25.4)
                continue
            if kind == "product":
                quantity = row["quantity"]
                value = row["value"]
                quantity_col = max(dc.GetTextExtent(quantity)[0] + int(dpi_x * 1.5 / 25.4), int(printable_width * 0.11))
                value_width = dc.GetTextExtent(value)[0]
                description_x = side_margin + quantity_col + int(dpi_x * 1.0 / 25.4)
                value_x = page_width - side_margin - value_width
                description_width = max(1, value_x - description_x - int(dpi_x * 1.0 / 25.4))
                lines = split_to_width(row["description"], description_width, lambda text: dc.GetTextExtent(text)[0])
                dc.TextOut(side_margin, y, quantity)
                dc.TextOut(max(description_x, value_x), y, value)
                for index, line in enumerate(lines):
                    dc.TextOut(description_x, y + index * line_height, line)
                y += max(1, len(lines)) * line_height + int(dpi_y * 0.35 / 25.4)
                continue
            lines = split_to_width(row["text"], printable_width, lambda text: dc.GetTextExtent(text)[0])
            for line in lines:
                text_width = dc.GetTextExtent(line)[0]
                x = max(side_margin, (page_width - text_width) // 2) if row.get("align") == "center" else max(side_margin, page_width - side_margin - text_width) if row.get("align") == "right" else side_margin
                dc.TextOut(x, y, line)
                y += line_height
            y += int(dpi_y * 0.25 / 25.4)

        dc.EndPage()
        end_result = dc.EndDoc()
        if end_result is not None and end_result <= 0:
            raise RuntimeError(f"Windows rejeitou o documento (retorno {end_result!r}).")
        logger.info("Impressão via driver finalizada: job=%s, largura efetiva=%.1f mm", job.get("id"), width_mm)
    except Exception:
        logger.exception("Falha na impressão pelo driver: job=%s printer=%s", job.get("id"), printer_name)
        try:
            dc.AbortDoc()
        except Exception:
            logger.exception("AbortDoc falhou: job=%s", job.get("id"))
        raise
    finally:
        try:
            dc.DeleteDC()
        except Exception:
            logger.exception("Falha ao liberar contexto: job=%s", job.get("id"))


def print_raw(job, config):
    import win32print

    printer_name = config.get("printer_name", "Driver - Impressora Bematech MP-2800 TH")
    printers = [printer[2] for printer in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    if printer_name not in printers:
        raise RuntimeError(f'Impressora "{printer_name}" não encontrada. Impressoras disponíveis: {", ".join(printers)}')
    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, (f"Acai {job['id']}", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            text = []
            for row in receipt_rows(job):
                text.append(row.get("text") or " ".join(str(row.get(key, "")) for key in ("quantity", "description", "value")))
                text.append("\n")
            data = "".join(text).encode("cp850", errors="replace")
            sent = win32print.WritePrinter(handle, data)
            if sent != len(data):
                raise RuntimeError(f"Envio RAW incompleto: {sent} de {len(data)} bytes.")
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


def process_job(job, config):
    if config["mode"] == "test":
        path = make_test_pdf(job)
        logger.info("PDF de teste criado: %s", path)
    elif config.get("print_method", "windows") == "raw":
        print_raw(job, config)
        logger.info("Trabalho enviado em RAW: %s", job["id"])
    else:
        print_with_driver(job, config)
        logger.info("Trabalho enviado pelo driver Windows: %s", job["id"])


def main():
    config = load_config()
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Agente iniciado. modo=%s método=%s impressora=%s", config["mode"], config.get("print_method", "windows"), config.get("printer_name", "Driver - Impressora Bematech MP-2800 TH"))
    while True:
        try:
            result = api(config, "claim")
            job = result.get("job")
            if not job:
                time.sleep(2)
                continue
            try:
                logger.info("Trabalho reservado: job=%s", job.get("id"))
                process_job(job, config)
                api(config, "complete", job["id"])
                logger.info("Trabalho marcado como concluído: job=%s", job.get("id"))
            except Exception as error:
                logger.exception("Falha de impressão; trabalho não será concluído: job=%s", job.get("id"))
                api(config, "error", job["id"], str(error))
        except KeyboardInterrupt:
            logger.info("Agente encerrado pelo operador.")
            break
        except Exception:
            logger.exception("Falha de conexão ou processamento da fila.")
            time.sleep(5)


if __name__ == "__main__":
    main()
