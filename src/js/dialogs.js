module.exports = {
  alert: str => window.alert(str),
  confirm: str => window.confirm(str),
  urgent: str => window.prompt(str + "\n\nType YES to confirm.") == "YES"
}
