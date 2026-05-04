# NoSQL Diagram Tool

Ferramenta estática para desenhar tabelas DynamoDB usando uma DSL simples, inspirada em ferramentas de modelagem visual e no fluxo textual do dbdiagram.

## Rodando

Abra `index.html` diretamente no navegador ou publique a pasta no GitHub Pages. Não há build step, backend ou dependências externas.

Também é possível iniciar um servidor local:

```bash
make start
```

Por padrão o app abre em `http://localhost:5177`. Para usar outra porta:

```bash
make start PORT=4200
```

## DSL

```text
project "Commerce DynamoDB"

table Orders {
  billing PAY_PER_REQUEST
  pk PK string
  sk SK string

  attr customerId string
  attr orderId string
  attr total number

  gsi GSI1 pk GSI1PK string sk GSI1SK string projection ALL
  access "Pedidos por cliente" primary PK="CUSTOMER#<customerId>" SK begins_with "ORDER#"
}
```

Comandos suportados:

- `project "Nome"` define o título do diagrama.
- `table Nome { ... }` define uma tabela.
- `billing PAY_PER_REQUEST` ou `billing PROVISIONED read 5 write 5`.
- `pk Nome string|number|binary` e `sk Nome string|number|binary`.
- `attr Nome string|number|binary` para atributos descritivos.
- `gsi Nome pk Campo string sk Campo string projection ALL|KEYS_ONLY|INCLUDE attr1,attr2`.
- `access "Nome" primary|Indice expressão` para documentar padrões de acesso.

## Publicação no GitHub Pages

Publique o diretório `estudos/nosql-diagram-tool` como site estático. Como os links são relativos (`./styles.css` e `./app.js`), o app funciona tanto na raiz quanto em subpaths do GitHub Pages.
# nosql-diagram-tool
