; installer.nsh — visual dark do instalador NSIS (auto-incluído pelo electron-builder).
;
; Limites do NSIS/MUI2 sem plugin de dark mode: botões (Voltar/Instalar/Cancelar),
; radios da página "instalar pra quem" e labels da página de progresso são
; controles nativos themed — ficam claros. O resto escurece:
;   título da janela (DWM) · header · faixa inferior · finish page ·
;   log de detalhes e barra de progresso nas cores do splash (âmbar/escuro).

; Log de detalhes + barra de progresso (InstProgressFlags colored usa estas
; cores): âmbar #d9a01e sobre #141416 — mesmo look da barra do splash.
!define MUI_INSTFILESPAGE_COLORS "D9A01E 141416"
!define MUI_INSTFILESPAGE_PROGRESSBAR "colored"

; Header + páginas welcome/finish (fundo/texto do splash).
!define MUI_BGCOLOR 0A0A0B
!define MUI_TEXTCOLOR ECECEA

; Barra de título dark (DWMWA_USE_IMMERSIVE_DARK_MODE=20, Win10 1809+; falha
; silenciosa em versões antigas) + faixa inferior (atrás dos botões) escura.
!define MUI_CUSTOMFUNCTION_GUIINIT BasaltGuiInit
Function BasaltGuiInit
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4)'
  SetCtlColors $HWNDPARENT ECECEA 0A0A0B
FunctionEnd

; O common.nsh do electron-builder fixa ShowInstDetails nevershow (sem botão de
; detalhes). customHeader é inserido DEPOIS dos templates → o último atributo
; vence: hide = oculto por padrão, com botão "Show details" pra expandir.
!macro customHeader
  ShowInstDetails hide
!macroend
