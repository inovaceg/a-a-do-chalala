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
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if not config.get("agent_token"):
        raise RuntimeError("Preencha agent_token no config.json.")
    if config.get("mode") not in ("test", "production"):
        raise RuntimeError('mode deve ser "test" ou "production".')
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
    lines = job["payload"].get("lines", [])
    height = max(70 * mm, (len(lines) * 8 + 32) * mm)
    pdf = canvas.Canvas(str(output), pagesize=(80 * mm, height))
    y = height - 14 * mm
    for line in lines:
        text = str(line.get("text", ""))[:180]
        bold = bool(line.get("bold"))
        pdf.setFont(font_name, 10 if bold else 8)
        pdf.drawCentredString(40 * mm, y, text)
        y -= 7 * mm
    pdf.setFont(font_name, 7)
    pdf.drawCentredString(40 * mm, 8 * mm, f"Trabalho {job['id']}")
    pdf.save()
    return output


def print_to_windows(job, config):
    import win32print

    printer_name = config.get("printer_name", "Bematech MP-2800 TH")
    printers = [printer[2] for printer in win32print.EnumPrinters( win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS)]
    if printer_name not in printers:
        raise RuntimeError(f'Impressora "{printer_name}" não encontrada. Impressoras disponíveis: {", ".join(printers)}')
    handle = win32print.OpenPrinter(printer_name)
    try:
        document = win32print.StartDocPrinter(handle, 1, (f"Açai {job['id']}", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            payload = job["payload"]
            text = ["\x1b@", "\x1ba\x01", "\x1b!\x10"]
            text.append(str(payload.get("title", "PEDIDO")))
            text.append("\x1b!\x00")
            text.append("\n")
            for line in payload.get("lines", []):
                text.append(str(line.get("text", "")))
                text.append("\n")
            text.extend(["\n\n", "\x1dV\x00"])
            win32print.WritePrinter(handle, "".join(text).encode("cp850", errors="replace"))
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


def process_job(job, config):
    if config["mode"] == "test":
        path = make_test_pdf(job)
        print(f"[{datetime.now().isoformat(timespec='seconds')}] PDF criado: {path}")
    else:
        print_to_windows(job, config)
        print(f"[{datetime.now().isoformat(timespec='seconds')}] Enviado à impressora: {job['id']}")


def main():
    config = load_config()
    TEST_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Agente de impressão iniciado. Modo: {config['mode']}. Ctrl+C para sair.")
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
