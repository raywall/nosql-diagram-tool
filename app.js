(function () {
  "use strict";

  const STORAGE_KEY = "nosql-diagram-tool:dsl";

  const sampleDsl = `project "Commerce DynamoDB"

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

table Products {
  billing PROVISIONED read 5 write 5
  pk PK string
  sk SK string

  attr sku string
  attr name string
  attr category string
  attr price number

  gsi CategoryIndex pk category string sk price number projection ALL

  access "Produto por SKU" primary PK="PRODUCT#<sku>" SK="PROFILE"
  access "Produtos por categoria" CategoryIndex category="<category>" price between 0 500
}`;

  const els = {
    dslInput: document.getElementById("dslInput"),
    modelStatus: document.getElementById("modelStatus"),
    cursorInfo: document.getElementById("cursorInfo"),
    diagramTitle: document.getElementById("diagramTitle"),
    diagramSubtitle: document.getElementById("diagramSubtitle"),
    diagramBoard: document.getElementById("diagramBoard"),
    diagramCanvas: document.getElementById("diagramCanvas"),
    tableCount: document.getElementById("tableCount"),
    summaryList: document.getElementById("summaryList"),
    errorsPanel: document.getElementById("errorsPanel"),
    jsonOutput: document.getElementById("jsonOutput"),
    cfnOutput: document.getElementById("cfnOutput"),
    formatBtn: document.getElementById("formatBtn"),
    sampleBtn: document.getElementById("sampleBtn"),
    copyBtn: document.getElementById("copyBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    fitBtn: document.getElementById("fitBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomLabel: document.getElementById("zoomLabel"),
  };

  let zoom = 1;
  let lastModel = null;

  function tokenize(line) {
    const tokens = [];
    const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|(\S+)/g;
    let match;
    while ((match = re.exec(line))) {
      tokens.push(match[1] ? match[1].replace(/\\"/g, '"') : match[2]);
    }
    return tokens;
  }

  function parseDsl(source) {
    const model = { project: "NoSQL Diagram", tables: [], errors: [] };
    const lines = source.split(/\r?\n/);
    let current = null;

    lines.forEach((rawLine, index) => {
      const lineNo = index + 1;
      const line = rawLine.trim();
      if (!line) return;

      if (line === "}") {
        current = null;
        return;
      }

      const tokens = tokenize(line);
      if (!tokens.length) return;

      if (tokens[0] === "project") {
        model.project = tokens.slice(1).join(" ") || model.project;
        return;
      }

      if (tokens[0] === "table") {
        if (!tokens[1]) {
          model.errors.push(error(lineNo, "Tabela sem nome."));
          return;
        }
        current = {
          name: tokens[1],
          billingMode: "PAY_PER_REQUEST",
          provisioned: null,
          keys: [],
          attributes: [],
          indexes: [],
          accessPatterns: [],
        };
        model.tables.push(current);
        return;
      }

      if (!current) {
        model.errors.push(error(lineNo, `Linha fora de uma tabela: ${line}`));
        return;
      }

      parseTableLine(current, tokens, lineNo, model.errors);
    });

    model.tables.forEach((table) => validateTable(table, model.errors));
    return model;
  }

  function parseTableLine(table, tokens, lineNo, errors) {
    const command = tokens[0];

    if (command === "billing") {
      table.billingMode = tokens[1] || "PAY_PER_REQUEST";
      if (table.billingMode === "PROVISIONED") {
        table.provisioned = {
          read: Number(tokens[tokens.indexOf("read") + 1] || 5),
          write: Number(tokens[tokens.indexOf("write") + 1] || 5),
        };
      }
      return;
    }

    if (command === "pk" || command === "sk") {
      const key = {
        role: command.toUpperCase(),
        name: tokens[1],
        type: normalizeType(tokens[2]),
      };
      if (!key.name) errors.push(error(lineNo, `${command.toUpperCase()} sem nome.`));
      table.keys.push(key);
      upsertAttribute(table, key.name, key.type, key.role);
      return;
    }

    if (command === "attr") {
      if (!tokens[1]) {
        errors.push(error(lineNo, "Atributo sem nome."));
        return;
      }
      upsertAttribute(table, tokens[1], normalizeType(tokens[2]), "ATTR");
      return;
    }

    if (command === "gsi") {
      table.indexes.push(parseIndex(tokens, lineNo, errors));
      return;
    }

    if (command === "access") {
      table.accessPatterns.push({
        name: tokens[1] || `Acesso ${table.accessPatterns.length + 1}`,
        target: tokens[2] || "primary",
        expression: tokens.slice(3).join(" "),
        lineNo,
      });
      return;
    }

    errors.push(error(lineNo, `Comando desconhecido: ${command}`));
  }

  function parseIndex(tokens, lineNo, errors) {
    const index = {
      name: tokens[1],
      pk: null,
      sk: null,
      projection: "ALL",
      include: [],
      lineNo,
    };

    for (let i = 2; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === "pk") {
        index.pk = { name: tokens[i + 1], type: normalizeType(tokens[i + 2]) };
        i += 2;
      } else if (token === "sk") {
        index.sk = { name: tokens[i + 1], type: normalizeType(tokens[i + 2]) };
        i += 2;
      } else if (token === "projection") {
        index.projection = (tokens[i + 1] || "ALL").toUpperCase();
        index.include = tokens.slice(i + 2).join(" ").split(",").map((item) => item.trim()).filter(Boolean);
        break;
      }
    }

    if (!index.name) errors.push(error(lineNo, "GSI sem nome."));
    if (!index.pk || !index.pk.name) errors.push(error(lineNo, `GSI ${index.name || ""} sem partition key.`));
    return index;
  }

  function validateTable(table, errors) {
    const pk = table.keys.find((key) => key.role === "PK");
    if (!pk) errors.push(error(null, `Tabela ${table.name} precisa de uma PK.`));
    const names = new Set();
    table.attributes.forEach((attr) => {
      if (names.has(attr.name)) errors.push(error(null, `Atributo duplicado em ${table.name}: ${attr.name}`));
      names.add(attr.name);
    });
  }

  function upsertAttribute(table, name, type, role) {
    const existing = table.attributes.find((attr) => attr.name === name);
    if (existing) {
      existing.type = type || existing.type;
      existing.role = existing.role === "ATTR" ? role : existing.role;
      return;
    }
    table.attributes.push({ name, type: type || "S", role });
  }

  function normalizeType(type) {
    const normalized = String(type || "string").toLowerCase();
    if (["number", "n", "num"].includes(normalized)) return "N";
    if (["binary", "b"].includes(normalized)) return "B";
    return "S";
  }

  function error(lineNo, message) {
    return { lineNo, message };
  }

  function render(model) {
    lastModel = model;
    els.diagramTitle.textContent = model.project;
    els.diagramSubtitle.textContent = `${model.tables.length} tabela(s), ${sum(model.tables, "indexes")} GSI(s), ${sum(model.tables, "accessPatterns")} acesso(s)`;
    els.tableCount.textContent = `${model.tables.length} tabela${model.tables.length === 1 ? "" : "s"}`;

    els.modelStatus.textContent = model.errors.length ? `${model.errors.length} erro(s)` : "Válido";
    els.modelStatus.classList.toggle("is-error", model.errors.length > 0);
    els.modelStatus.classList.toggle("is-ok", model.errors.length === 0);

    renderDiagram(model);
    renderSummary(model);
    renderExports(model);
    localStorage.setItem(STORAGE_KEY, els.dslInput.value);
  }

  function sum(tables, key) {
    return tables.reduce((total, table) => total + table[key].length, 0);
  }

  function renderDiagram(model) {
    els.diagramBoard.innerHTML = "";

    if (!model.tables.length) {
      els.diagramBoard.innerHTML = '<div class="empty-state">Crie uma tabela com <code>table Nome { ... }</code>.</div>';
      return;
    }

    model.tables.forEach((table) => {
      const card = document.createElement("article");
      card.className = "table-card";
      card.innerHTML = `
        <div class="table-head">
          <h3>${escapeHtml(table.name)}</h3>
          <span class="billing-pill">${escapeHtml(table.billingMode)}</span>
        </div>
        ${section("Chaves", renderKeys(table))}
        ${section("Atributos", renderAttributes(table))}
        ${section("Índices", renderIndexes(table))}
        ${section("Acessos", renderAccess(table))}
      `;
      els.diagramBoard.appendChild(card);
    });
  }

  function section(title, content) {
    return `<div class="table-section"><h4>${title}</h4>${content || '<span class="muted">Nenhum</span>'}</div>`;
  }

  function renderKeys(table) {
    return table.keys
      .map((key) => `<div class="field-row"><span class="tag ${key.role.toLowerCase()}">${key.role}</span><code>${escapeHtml(key.name)}</code><span class="muted">${key.type}</span></div>`)
      .join("");
  }

  function renderAttributes(table) {
    return table.attributes
      .filter((attr) => attr.role === "ATTR")
      .map((attr) => `<div class="field-row"><span class="tag">A</span><code>${escapeHtml(attr.name)}</code><span class="muted">${attr.type}</span></div>`)
      .join("");
  }

  function renderIndexes(table) {
    return table.indexes
      .map((idx) => {
        const keys = [idx.pk && `PK ${idx.pk.name}`, idx.sk && `SK ${idx.sk.name}`].filter(Boolean).join(" / ");
        return `<div class="index-row"><span class="tag gsi">GSI</span><code>${escapeHtml(idx.name)}</code><span class="muted">${escapeHtml(keys)}</span></div>`;
      })
      .join("");
  }

  function renderAccess(table) {
    return table.accessPatterns
      .map((access) => `<div class="access-row"><span class="tag">${escapeHtml(access.target)}</span><code>${escapeHtml(access.name)}</code><span class="muted">${escapeHtml(access.expression)}</span></div>`)
      .join("");
  }

  function renderSummary(model) {
    els.summaryList.innerHTML = "";

    model.tables.forEach((table) => {
      const item = document.createElement("div");
      item.className = "summary-item";
      item.innerHTML = `
        <strong>${escapeHtml(table.name)}</strong>
        <span>${table.attributes.length} atributo(s), ${table.indexes.length} índice(s), ${table.accessPatterns.length} acesso(s)</span>
      `;
      els.summaryList.appendChild(item);
    });

    if (!model.tables.length) {
      els.summaryList.innerHTML = '<div class="empty-state">O resumo aparece quando houver tabelas no modelo.</div>';
    }

    els.errorsPanel.hidden = model.errors.length === 0;
    els.errorsPanel.innerHTML = model.errors
      .map((err) => `<div>${err.lineNo ? `Linha ${err.lineNo}: ` : ""}${escapeHtml(err.message)}</div>`)
      .join("");
  }

  function renderExports(model) {
    els.jsonOutput.textContent = JSON.stringify(model, null, 2);
    els.cfnOutput.textContent = JSON.stringify(toCloudFormation(model), null, 2);
  }

  function toCloudFormation(model) {
    const resources = {};
    model.tables.forEach((table) => {
      resources[`${table.name}Table`] = {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: table.name,
          BillingMode: table.billingMode,
          AttributeDefinitions: attributeDefinitions(table),
          KeySchema: keySchema(table.keys),
          GlobalSecondaryIndexes: table.indexes.map((idx) => ({
            IndexName: idx.name,
            KeySchema: keySchema([toKey("PK", idx.pk), toKey("SK", idx.sk)].filter(Boolean)),
            Projection: projection(idx),
          })),
        },
      };

      if (table.billingMode === "PROVISIONED" && table.provisioned) {
        resources[`${table.name}Table`].Properties.ProvisionedThroughput = {
          ReadCapacityUnits: table.provisioned.read,
          WriteCapacityUnits: table.provisioned.write,
        };
      }
    });
    return { AWSTemplateFormatVersion: "2010-09-09", Description: model.project, Resources: resources };
  }

  function attributeDefinitions(table) {
    const defs = new Map();
    table.keys.forEach((key) => defs.set(key.name, key.type));
    table.indexes.forEach((idx) => {
      if (idx.pk) defs.set(idx.pk.name, idx.pk.type);
      if (idx.sk) defs.set(idx.sk.name, idx.sk.type);
    });
    return Array.from(defs, ([AttributeName, AttributeType]) => ({ AttributeName, AttributeType }));
  }

  function keySchema(keys) {
    return keys
      .filter((key) => key && key.name)
      .map((key) => ({
        AttributeName: key.name,
        KeyType: key.role === "PK" ? "HASH" : "RANGE",
      }));
  }

  function toKey(role, key) {
    return key && { role, name: key.name, type: key.type };
  }

  function projection(idx) {
    const projectionType = idx.projection || "ALL";
    const result = { ProjectionType: projectionType };
    if (projectionType === "INCLUDE" && idx.include.length) {
      result.NonKeyAttributes = idx.include;
    }
    return result;
  }

  function formatDsl(source) {
    let depth = 0;
    return source
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";
        if (trimmed === "}") depth = Math.max(0, depth - 1);
        const formatted = `${"  ".repeat(depth)}${trimmed}`;
        if (trimmed.endsWith("{")) depth += 1;
        return formatted;
      })
      .join("\n");
  }

  function downloadProject() {
    const blob = new Blob([els.dslInput.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dynamodb-model.nosql";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function copyDsl() {
    navigator.clipboard.writeText(els.dslInput.value).then(() => {
      els.copyBtn.textContent = "Copiado";
      setTimeout(() => {
        els.copyBtn.textContent = "Copiar";
      }, 1200);
    });
  }

  function setZoom(nextZoom) {
    zoom = Math.min(1.5, Math.max(0.65, nextZoom));
    els.diagramBoard.style.transform = `scale(${zoom})`;
    els.diagramBoard.style.width = `${100 / zoom}%`;
    els.zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function updateCursor() {
    const value = els.dslInput.value.slice(0, els.dslInput.selectionStart);
    const lines = value.split(/\r?\n/);
    els.cursorInfo.textContent = `Linha ${lines.length}, Coluna ${lines[lines.length - 1].length + 1}`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function bindEvents() {
    els.dslInput.addEventListener("input", () => render(parseDsl(els.dslInput.value)));
    els.dslInput.addEventListener("keyup", updateCursor);
    els.dslInput.addEventListener("click", updateCursor);
    els.formatBtn.addEventListener("click", () => {
      els.dslInput.value = formatDsl(els.dslInput.value);
      render(parseDsl(els.dslInput.value));
    });
    els.sampleBtn.addEventListener("click", () => {
      els.dslInput.value = sampleDsl;
      render(parseDsl(els.dslInput.value));
    });
    els.copyBtn.addEventListener("click", copyDsl);
    els.downloadBtn.addEventListener("click", downloadProject);
    els.zoomOutBtn.addEventListener("click", () => setZoom(zoom - 0.1));
    els.zoomInBtn.addEventListener("click", () => setZoom(zoom + 0.1));
    els.fitBtn.addEventListener("click", () => setZoom(1));

    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
        document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("is-active"));
        tab.classList.add("is-active");
        document.getElementById(`${tab.dataset.tab}Tab`).classList.add("is-active");
      });
    });
  }

  function init() {
    els.dslInput.value = localStorage.getItem(STORAGE_KEY) || sampleDsl;
    bindEvents();
    setZoom(1);
    updateCursor();
    render(parseDsl(els.dslInput.value));
  }

  init();
})();
