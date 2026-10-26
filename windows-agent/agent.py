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
    response = requests.post(
        FUNCTION_URL,
        headers={"apikey": PUBLISHABLE_KEY, "x-agent-token": config["agent_token"]},
        json=body,
        timeout=25,
    )
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
        {"text": "AÇAÍ DO CHALALA", "align": "center", "size": 15, "bold": True},
        {"text": "O sabor que conquista!", "align": "center", "size": 9, "italic": True},
        {"text": "Endereço: R. Luís Marchini, 228 - São Benedito, Juiz de Fora - MG, 36061-270", "align": "center", "size": 8},
        {"text": "--------------------------------", "align": "center", "size": 8},
        {"text": "COMPROVANTE DE PEDIDO", "align": "center", "size": 10, "bold": True},
        {"text": "--------------------------------", "align": "center", "size": 8},
        {"text": f"PEDIDO Nº {receipt.get('orderNumber', payload.get('title', 'TESTE'))}", "align": "center", "size": 13, "bold": True},
        {"text": f"DATA: {format_datetime(receipt.get('soldAt', payload.get('createdAt', datetime.now().isoformat())))}", "size": 8},
        {"text": f"OPERADOR: {receipt.get('operator', 'Caixa central')}", "size": 8},
    ]
    rows.append({"text": f"TIPO: {'DELIVERY' if receipt.get('delivery') else 'NÃO DELIVERY'}", "size": 9, "bold": True})
    if receipt.get("customer"):
        rows.append({"text": f"CLIENTE: {receipt['customer']}", "size": 8})
    customer_address = receipt.get("deliveryAddress") if receipt.get("delivery") else receipt.get("customerAddress")
    if customer_address:
        rows.append({"text": f"ENDEREÇO DO CLIENTE: {customer_address}", "size": 8})
    if receipt.get("courier"):
        rows.append({"text": f"ENTREGADOR: {receipt['courier']}", "size": 8})
    rows.append({"text": "--------------------------------", "align": "center", "size": 8})
    products = receipt.get("products", [])
    if products:
        for product in products:
            rows.append({"text": f"{product.get('quantity', 1)} x {product.get('name', 'Produto')}  {format_money(product.get('line_total', product.get('unit_price', 0)))}", "size": 9, "bold": True})
            for extra in product.get("extras", []):
                rows.append({"text": f"  + {extra.get('name', '')} ({format_money(extra.get('price', 0))})", "size": 8})
            if product.get("note"):
                rows.append({"text": f"  Obs: {product['note']}", "size": 8, "italic": True})
    else:
        rows.extend({"text": str(line.get("text", "")), "size": 9, "bold": bool(line.get("bold"))} for line in payload.get("lines", []))
    rows.append({"text": "--------------------------------", "align": "center", "size": 8})
    for payment in receipt.get("payments", []):
        rows.append({"text": f"PAGAMENTO: {payment.get('method', '')}  {format_money(payment.get('amount', ''))}", "size": 8})
    if receipt.get("total") is not None:
        rows.append({"text": f"TOTAL  {format_money(receipt['total'])}", "align": "right", "size": 12, "bold": True})
    if receipt.get("notes"):
        rows.append({"text": f"OBSERVAÇÃO: {receipt['notes']}", "size": 8})
    rows.extend([
        {"text": "--------------------------------", "align": "center", "size": 8},
        {"text": "Obrigado pela preferência!", "align": "center", "size": 9, "bold": True},
        {"text": "Volte sempre ao Açaí do Chalala!", "align": "center", "size": 8},
    ])
    return rows


def make_test_pdf(job):
    from reportlab.lib.units import mm
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas

    TEST_DIR.mkdir(parents=True, exist_ok=True)
    output = TEST_DIR / f"{job['id']}.pdf"
    rows = receipt_rows(job)
    width = 80 * mm
    margin = 3 * mm
    usable = width - 2 * margin
    prepared = []
    for row in rows:
        font_name = "Helvetica-Bold" if row.get("bold") else "Helvetica-Oblique" if row.get("italic") else "Helvetica"
        size = row.get("size", 9)
        prepared.extend((row, font_name, line, size) for line in simpleSplit(row["text"], font_name, size, usable))
    height = max(45 * mm, (sum(entry[3] * 1.55 + 2 for entry in prepared) + 12) * mm / 2.83465)
    pdf = canvas.Canvas(str(output), pagesize=(width, height))
    y = height - margin
    for row, font_name, text, size in prepared:
        pdf.setFont(font_name, size)
        if row.get("align") == "center":
            pdf.drawCentredString(width / 2, y, text)
        elif row.get("align") == "right":
            pdf.drawRightString(width - margin, y, text)
        else:
            pdf.drawString(margin, y, text)
        y -= size * 1.55 + 2
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
    dpi_y = dc.GetDeviceCaps(win32con.LOGPIXELSY)
    page_width = dc.GetDeviceCaps(win32con.HORZRES)
    rows = receipt_rows(job)
    line_height = int(dpi_y * 0.18)
    try:
        start_result = dc.StartDoc(f"Acai do Chalala - {job['id']}")
        if start_result is not None and start_result <= 0:
            raise RuntimeError(f"O Windows não conseguiu iniciar o documento de impressão (retorno {start_result!r}).")
        if start_result is None:
            logger.warning("StartDoc não retornou identificador; prosseguindo conforme ausência de exceção. job=%s", job.get("id"))
        dc.StartPage()
        y = int(dpi_y * 0.12)
        for row in rows:
            size = row.get("size", 9)
            bold = row.get("bold", False)
            italic = row.get("italic", False)
            font = win32ui.CreateFont({"name": "Arial", "height": int(dpi_y * size / 72), "weight": 700 if bold else 400, "italic": italic})
            dc.SelectObject(font)
            max_chars = max(8, int(page_width / max(1, dpi_y * size / 72 * 0.58)))
            text = row["text"]
            wrapped = []
            while len(text) > max_chars:
                cut = text.rfind(" ", 0, max_chars + 1)
                if cut < 1:
                    cut = max_chars
                wrapped.append(text[:cut])
                text = text[cut:].lstrip()
            wrapped.append(text)
            for line in wrapped:
                text_width = dc.GetTextExtent(line)[0]
                if row.get("align") == "center":
                    x = max(0, (page_width - text_width) // 2)
                elif row.get("align") == "right":
                    x = max(0, page_width - text_width)
                else:
                    x = 0
                dc.TextOut(x, y, line)
                y += max(line_height, int(dpi_y * size / 72 * 1.4))
        dc.EndPage()
        end_result = dc.EndDoc()
        if end_result is not None and end_result <= 0:
            raise RuntimeError(f"O Windows rejeitou o documento ao finalizar a impressão (retorno {end_result!r}).")
        if end_result is None:
            logger.warning("EndDoc não retornou código; chamada terminou sem exceção. job=%s", job.get("id"))
        logger.info("Envio ao driver Windows concluído: job=%s start=%r end=%r", job.get("id"), start_result, end_result)
    except Exception:
        logger.exception("Falha ao enviar job=%s para impressora=%s", job.get("id"), printer_name)
        try:
            dc.AbortDoc()
        except Exception:
            logger.exception("AbortDoc também falhou para job=%s", job.get("id"))
        raise
    finally:
        try:
            dc.DeleteDC()
        except Exception:
            logger.exception("Falha ao liberar contexto de impressão job=%s", job.get("id"))


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
            rows = receipt_rows(job)
            text = ["\x1b@", "\x1ba\x01"]
            for row in rows:
                text.extend([row["text"], "\n"])
            text.extend(["\n\n", "\x1dV\x00"])
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
