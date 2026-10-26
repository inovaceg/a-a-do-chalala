# Agente local de impressão — AÇAÍ DO CHALALA

Celulares e computadores criam pedidos na fila persistente do Supabase. Somente o agente instalado no computador central reserva e imprime esses pedidos. A impressora não precisa estar acessível aos celulares.

## Requisitos

- Windows 10/11 com conexão à internet e Python 3.11 ou superior.
- Para produção: driver da Bematech MP-2800 TH instalado e configurado no Windows. Use o nome exato mostrado em **Impressoras e scanners**. Ajuste o tamanho do papel para bobina térmica (80 mm ou o tamanho suportado) nas preferências do driver.
- Para teste: não é necessária impressora física.

## Credencial do agente

No sistema, entre como administrador, abra **PDV → Impressão centralizada** e gere o token. O token é exibido somente uma vez. Não compartilhe nem publique `config.json`; o agente usa apenas o token individual da loja, nunca credenciais administrativas.

## Instalação inicial

Abra PowerShell na pasta `windows-agent`, substitua o token pelo valor gerado no painel e instale em modo de teste:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-agent.ps1 -AgentToken "TOKEN_COPIADO_DO_PAINEL" -Mode test
& "C:\ImpressaoAcai\.venv\Scripts\python.exe" "C:\ImpressaoAcai\agent.py"
```

Os trabalhos de teste são salvos automaticamente em `C:\ImpressaoAcai\Testes` como PDF de bobina, sem abrir uma janela de salvamento e sem imprimir papel. Configure a largura com `-PaperWidthMm 58` ou `-PaperWidthMm 80`; a altura do documento é calculada a partir do conteúdo.

## Produção: driver Windows (recomendado)

Feche o agente que estiver aberto e instale/atualize com o nome exato da impressora. A largura pode ser configurada como 80 mm (padrão) ou 58 mm:

```powershell
.\install-agent.ps1 -Mode production -PrintMethod windows -PrinterName "Driver - Impressora Bematech MP-2800 TH" -PaperWidthMm 80
& "C:\ImpressaoAcai\.venv\Scripts\python.exe" "C:\ImpressaoAcai\agent.py"
```

Use `-PaperWidthMm 58` para bobina de 58 mm. Em produção, o agente limita o layout à largura configurada e à área imprimível que o driver reporta.

Esse método desenha o cupom com GDI do Windows e o envia ao driver selecionado; não envia ESC/POS RAW. O agente consulta `HORZRES` e o DPI do contexto de impressão para medir a largura útil, centraliza o cabeçalho, destaca pedido/tipo/total e quebra descrições conforme a largura real. Confirme que o formulário da bobina está configurado nas preferências do driver.

## Método RAW/ESC-POS

Para selecionar explicitamente o método antigo:

```powershell
.\install-agent.ps1 -Mode production -PrintMethod raw -PrinterName "Driver - Impressora Bematech MP-2800 TH"
& "C:\ImpressaoAcai\.venv\Scripts\python.exe" "C:\ImpressaoAcai\agent.py"
```

Use-o apenas se a impressora/porta aceitar esse protocolo. O método padrão é `windows`.

## Atualizar instalação existente sem perder o token

1. Pare o agente aberto com `Ctrl+C`.
2. Abra PowerShell na nova pasta `windows-agent` do projeto. O instalador lê o token de `C:\ImpressaoAcai\config.json` se `-AgentToken` for omitido, mantendo-o durante a atualização.
3. Execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-agent.ps1 -Mode production -PrintMethod windows -PrinterName "Driver - Impressora Bematech MP-2800 TH"
& "C:\ImpressaoAcai\.venv\Scripts\python.exe" "C:\ImpressaoAcai\agent.py"
```

O instalador substitui os arquivos do agente e atualiza as dependências, sem apagar `config.json` nem a pasta de PDFs. Se a configuração existente não puder ser lida, ele interrompe em vez de sobrescrevê-la. Como precaução, pode-se copiar `C:\ImpressaoAcai\config.json` antes de atualizar.

## Verificar o resultado

Envie um pedido de teste pelo painel de impressão centralizada e confirme que aparece na fila do computador central. Depois teste um pedido real e confira no spooler do Windows se o documento foi aceito e impresso. Trabalhos concluídos indicam que a chamada de impressão do Windows terminou sem erro; o spooler/driver pode ainda reportar falhas físicas após aceitar um trabalho. Falhas retornadas pela chamada de impressão são registradas como **Erro**, não como **Concluído**.

Para encerrar o agente, use `Ctrl+C`. Para iniciar automaticamente após reinicialização, configure uma tarefa no Agendador de Tarefas com executável `C:\ImpressaoAcai\.venv\Scripts\python.exe`, argumento `C:\ImpressaoAcai\agent.py` e diretório inicial `C:\ImpressaoAcai`.

## Configuração

`C:\ImpressaoAcai\config.json` contém `agent_token`, `mode` (`test` ou `production`), `printer_name` e `print_method` (`windows` ou `raw`). Proteja esse arquivo e o acesso ao computador central. Somente esse agente deve permanecer ativo como impressor central da loja.
