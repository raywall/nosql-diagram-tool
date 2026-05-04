# NoSQL Diagram Tool

NoSQL Diagram Tool é uma ferramenta estática para modelar tabelas DynamoDB usando uma DSL simples e legível. A proposta é combinar um fluxo textual parecido com o dbdiagram.io com uma visualização imediata das tabelas, chaves, índices e padrões de acesso.

O projeto foi pensado para estudos, documentação de arquitetura e exploração de modelagem single-table ou multi-table em DynamoDB. Ele roda inteiramente no navegador, sem backend, sem build step e sem dependências externas, o que permite publicar diretamente no GitHub Pages.

## Para que Serve

- Desenhar modelos DynamoDB rapidamente a partir de texto.
- Documentar partition keys, sort keys, atributos, GSIs e access patterns.
- Explorar estratégias de consulta antes de implementar a tabela.
- Gerar uma representação JSON do modelo criado.
- Gerar um esqueleto de CloudFormation para as tabelas modeladas.
- Manter modelos simples versionáveis em texto.

## Funcionalidades

- Editor DSL com exemplo inicial e formatação básica.
- Diagrama visual gerado automaticamente conforme o texto é alterado.
- Suporte a múltiplas tabelas no mesmo projeto.
- Modelagem de billing mode `PAY_PER_REQUEST` e `PROVISIONED`.
- Definição de partition key e sort key.
- Definição de atributos descritivos.
- Definição de Global Secondary Indexes.
- Registro de padrões de acesso por tabela ou índice.
- Inspector lateral com resumo do modelo.
- Aba JSON com a estrutura parseada do projeto.
- Aba CFN com um template CloudFormation básico.
- Botão para copiar a DSL atual.
- Botão para baixar o modelo em arquivo `.nosql`.
- Botão para carregar novamente o exemplo.
- Controles de zoom do diagrama.
- Sidebars de modelo e inspector minimizáveis para ampliar a área do diagrama.
- Persistência local via `localStorage`.
- Publicação estática compatível com GitHub Pages.

## Estrutura do Projeto

```text
.
├── index.html
├── styles.css
├── app.js
├── Makefile
├── README.md
└── .github/workflows/deploy.yaml
```

## Rodando Localmente

Abra `index.html` diretamente no navegador ou use o Makefile:

```bash
make start
```

Por padrão o app abre em:

```text
http://localhost:5177
```

Para usar outra porta:

```bash
make start PORT=4200
```

Para encerrar o processo na porta configurada:

```bash
make stop
```

## DSL

A DSL é baseada em blocos. Um projeto pode ter várias tabelas, e cada tabela pode conter chaves, atributos, índices e padrões de acesso.

```text
project "Commerce DynamoDB"

table Orders {
  billing PAY_PER_REQUEST
  pk PK string
  sk SK string

  attr customerId string
  attr orderId string
  attr status string
  attr createdAt string
  attr total number

  gsi GSI1 pk GSI1PK string sk GSI1SK string projection ALL
  gsi StatusIndex pk status string sk createdAt string projection INCLUDE total,customerId

  access "Pedidos por cliente" primary PK="CUSTOMER#<customerId>" SK begins_with "ORDER#"
  access "Pedidos por status" GSI1 GSI1PK="STATUS#<status>" GSI1SK begins_with "CREATED#"
}
```

## Comandos da DSL

### Projeto

```text
project "Nome do Projeto"
```

Define o título exibido no diagrama.

### Tabela

```text
table Orders {
  ...
}
```

Define uma tabela DynamoDB.

### Billing

```text
billing PAY_PER_REQUEST
```

ou:

```text
billing PROVISIONED read 5 write 5
```

Define o modo de cobrança da tabela.

### Chaves

```text
pk PK string
sk SK string
```

Define partition key e sort key. Tipos suportados para chaves:

- `string`
- `number`
- `binary`

Esses tipos são exportados no CloudFormation como `S`, `N` e `B`.

### Atributos

```text
attr customerId string
attr total number
```

Define atributos descritivos da tabela. Na versão atual, os tipos suportados são:

- `string`
- `number`
- `binary`

### Global Secondary Index

```text
gsi GSI1 pk GSI1PK string sk GSI1SK string projection ALL
```

Também é possível definir projeção `INCLUDE`:

```text
gsi StatusIndex pk status string sk createdAt string projection INCLUDE total,customerId
```

Projeções suportadas:

- `ALL`
- `KEYS_ONLY`
- `INCLUDE`

### Padrões de Acesso

```text
access "Pedidos por cliente" primary PK="CUSTOMER#<customerId>" SK begins_with "ORDER#"
```

ou usando um índice:

```text
access "Pedidos por status" GSI1 GSI1PK="STATUS#<status>" GSI1SK begins_with "CREATED#"
```

Esse comando serve para documentar como a aplicação pretende consultar a tabela ou índice.

## Recursos de Interface

### Editor

O painel `Modelo` contém a DSL editável. Alterações no texto atualizam o diagrama automaticamente. O conteúdo é salvo no navegador via `localStorage`.

### Diagrama

O painel central exibe as tabelas como cartões visuais, com seções para:

- chaves;
- atributos;
- índices;
- padrões de acesso.

O diagrama possui controles de zoom e ajuste.

### Inspector

O painel `Inspector` possui três abas:

- `Resumo`: visão compacta das tabelas e erros de modelagem.
- `JSON`: modelo parseado em JSON.
- `CFN`: template CloudFormation básico.

### Sidebars

As sidebars `Modelo` e `Inspector` podem ser minimizadas individualmente. Isso aumenta a área disponível para visualização do diagrama. O estado das sidebars também é salvo localmente.

## Exportações

### JSON

Representa o modelo interno gerado a partir da DSL. É útil para depuração, integração futura ou documentação.

### CloudFormation

Gera um template básico com recursos `AWS::DynamoDB::Table`, incluindo:

- `TableName`;
- `BillingMode`;
- `AttributeDefinitions`;
- `KeySchema`;
- `GlobalSecondaryIndexes`;
- `ProvisionedThroughput`, quando aplicável.

O CloudFormation gerado deve ser revisado antes de uso em produção.

## Publicação no GitHub Pages

O workflow em `.github/workflows/deploy.yaml` publica o projeto no GitHub Pages usando as actions oficiais:

- `actions/configure-pages`
- `actions/upload-pages-artifact`
- `actions/deploy-pages`

Como os assets usam caminhos relativos (`./styles.css` e `./app.js`), o app funciona tanto na raiz do GitHub Pages quanto em subpaths.

O deploy é acionado em pushes para a branch `main` quando arquivos do app ou o workflow são alterados. Também é possível rodar manualmente via `workflow_dispatch`.

## Limitações Atuais

- A DSL ainda não possui suporte nativo para `array`, `map` ou `struct`.
- Não há importação automática de modelos existentes da AWS.
- O template CloudFormation é um esqueleto inicial, não uma garantia de configuração final de produção.
- Não há backend, autenticação ou sincronização entre dispositivos.