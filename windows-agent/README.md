# Agente local de impressão — AÇAÍ DO CHALALA

O agente Windows consulta a fila persistente do Supabase pela internet. O celular e os computadores enviam pedidos ao backend hospedado; o agente central os reserva atomicamente e imprime. Não é necessário que o celular esteja na mesma rede do computador.

## Requisitos

- Windows 10/11 com conexão à internet.
- Python 3.11 ou superior.
- Para produção: driver da Bematech MP-2800 TH instalado no Windows e nome da impressora exatamente igual ao cadastrado no Windows.
- Para teste: impressora física não é necessária.

## Provisionar credencial

1. Entre no sistema com perfil administrador e abra **PDV**.
2. Em **Impressão centralizada**, escolha **Gerar token**.
3. Copie o token exibido naquele momento. Por segurança, o token integral não é armazenado e não poderá ser mostrado novamente. Se perder, revogue a credencial antiga no Supabase e gere outra.
4. Não envie esse token por mensagem pública nem o coloque em repositórios.

O agente usa um token exclusivo da loja. A credencial administrativa/service-role nunca é enviada ao computador. O banco guarda somente o hash SHA-256 do token. A chave publishable incluída no agente é pública e não concede acesso administrativo.

## Instalar em modo de teste

Abra PowerShell na pasta `windows-agent` deste projeto e execute, substituindo o valor pelo token gerado no painel:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-agent.ps1 -AgentToken "TOKEN_COPIADO_DO_PAINEL" -Mode test
& "C:\ImpressaoAcai\.venv\Scripts\python.exe" "C:\ImpressaoAcai\agent.py"
```

O agente fica consultando a fila, sem abrir janelas. Cada trabalho recebido gera um arquivo `<id-do-trabalho>.pdf` em `C:\ImpressaoAcai\Testes` e atualiza o status para **Concluído**. Se a criação falhar, o status muda para **Erro**.

## Instalar em modo de produção

Confirme primeiro o nome da impressora em **Configurações do Windows → Bluetooth e dispositivos → Impressoras e scanners**. Então instale e inicie o agente:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-agent.ps1 -AgentToken "TOKEN_COPIADO_DO_PAINEL" -Mode production -PrinterName "Bematech MP-2800 TH"
& "C:\ImpressaoAcai\.venv\Scripts\python.exe" "C:\ImpressaoAcai\agent.py"
```

O modo produção envia texto ESC/POS diretamente à fila RAW do driver selecionado. O status **Concluído** indica que o spooler Windows aceitou o trabalho; a confirmação física de papel impresso depende do driver e do dispositivo.

## Configuração local

O instalador cria `C:\ImpressaoAcai\config.json` com o token, o modo e o nome da impressora. O modo é `test` ou `production`; o padrão do instalador é `test`. Proteja o acesso ao computador e não compartilhe esse arquivo. Para trocar o modo, execute novamente o instalador com o mesmo token e modo desejado.

Para encerrar o agente, pressione `Ctrl+C`. Para iniciar automaticamente após reinicialização, configure uma tarefa no Agendador de Tarefas do Windows com o executável `C:\ImpressaoAcai\.venv\Scripts\python.exe`, argumento `C:\ImpressaoAcai\agent.py` e diretório de início `C:\ImpressaoAcai`.
