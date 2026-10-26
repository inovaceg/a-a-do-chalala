import json
import os
import time
from datetime import datetime
from pathlib import Path

import requests

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


def receipt_rows(job):
    payload = job["payload"]
    rows = [str(payload.get("title", "PEDIDO"))]
    rows.extend(str(line.get("text", "")) for line in payload.get("lines", []))
    return rows


def make_test_pdf(job):
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    TEST_DIR.mkdir(parents=True, exist_ok=True)
    output = TEST_DIR / f"{job['id']}.pdf"
    font_path = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "arial.ttf"
    if font_path.exists():
        pdfmetrics.registerFont(TTFont("ArialReceipt", str(font_path)))
        font_name = "ArialReceipt"
    else:
        font_name = "Helvetica"
    rows = receipt_rows(job)
    height = max(70 * mm, (len(rows) * 6 + 30) * mm)
    pdf = canvas.Canvas(str(output), pagesize=(80 * mm, height))
    y = height - 12 * mm
    for index, text in enumerate(rows):
        pdf.setFont(font_name, 10 if index == 0 else 8)
        pdf.drawCentredString(40 * mm, y, text[:180])
        y -= 6 * mm
    pdf.setFont(font_name, 7)
    pdf.drawCentredString(40 * mm, 6 * mm, f"Trabalho {job['id']}")
    pdf.save()
    return output


def print_with_driver(job, config):
    import win32con
    import win32print
    import win32ui

    printer_name = config.get("printer_name", "Driver - Impressora Bematech MP-2800 TH")
    printers = [printer[2] for printer in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    if printer_name not in printers:
        raise RuntimeError(f'Impressora "{printer_name}" não encontrada. Impressoras disponíveis: {", ".join(printers)}')

    dc = win32ui.CreateDC()
    dc.CreatePrinterDC(printer_name)
    dpi_x = dc.GetDeviceCaps(win32con.LOGPIXELSX)
    dpi_y = dc.GetDeviceCaps(win32con.LOGPIXELSY)
    page_width = dc.GetDeviceCaps(win32con.HORZRES)
    rows = receipt_rows(job)
    font_height = max(1, int(dpi_y * 9 / 72))
    line_height = int(font_height * 1.55)
    try:
        if dc.StartDoc(f"Acai do Chalala - {job['id']}") <= 0:
            raise RuntimeError("O Windows não conseguiu iniciar o documento de impressão.")
        dc.StartPage()
        y = int(dpi_y * 0.12)
        for index, text in enumerate(rows):
            font = win32ui.CreateFont({"name": "Arial", "height": int(dpi_y * (12 if index == 0 else 9) / 72), "weight": 700 if index == 0 else 400})
            dc.SelectObject(font)
            width = dc.GetTextExtent(text[:180])[0]
            dc.TextOut(max(0, (page_width - width) // 2), y, text[:180])
            y += line_height
        dc.EndPage()
        if dc.EndDoc() <= 0:
            raise RuntimeError("O Windows rejeitou o documento ao finalizar a impressão.")
    except Exception:
        try:
            dc.AbortDoc()
        except Exception:
            pass
        raise
    finally:
        dc.DeleteDC()


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
            payload = job["payload"]
            text = ["\x1b@", "\x1ba\x01", "\x1b!\x10", str(payload.get("title", "PEDIDO")), "\x1b!\x00", "\n"]
            for line in payload.get("lines", []):
                text.extend([str(line.get("text", "")), "\n"])
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
        print(f"[{datetime.now().isoformat(timespec='seconds')}] PDF criado: {path}")
    elif config.get("print_method", "windows") == "raw":
        print_raw(job, config)
        print(f"[{datetime.now().isoformat(timespec='seconds')}] Trabalho enviado em RAW: {job['id']}")
    else:
        print_with_driver(job, config)
        print(f"[{datetime.now().isoformat(timespec='seconds')}] Trabalho enviado pelo driver Windows: {job['id']}")


def main():
    config = load_config()
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Agente de impressão iniciado. Modo: {config['mode']}; método: {config.get('print_method', 'windows')}. Ctrl+C para sair.")
    while True:
        try:
            result = api(config, "claim")
            job = result.get("job")
            if not job:
                time.sleep(2)
                continue
            try:
                process_job(job, config)
                api(config, "complete", job["id"])
            except Exception as error:
                detail = str(error)
                print(f"Erro no trabalho {job['id']}: {detail}")
                api(config, "error", job["id"], detail)
        except KeyboardInterrupt:
            print("Agente encerrado.")
            break
        except Exception as error:
            print(f"Falha de conexão/processamento: {error}")
            time.sleep(5)


if __name__ == "__main__":
    main()
