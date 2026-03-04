import Chart from 'chart.js/auto';

import {
  getLocalFinanceSnapshot,
  saveFinanceTagOptimistic,
  saveFinanceCommitmentOptimistic,
  saveFinanceOccurrenceOptimistic,
  saveFinanceCommitmentTagOptimistic,
} from '../sync.js';

import { generateOccurrencesForCommitment } from './generateOccurrences.js';

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function byMonthKey(isoDate) {
  const [y, m] = isoDate.split('-');
  return `${y}-${m}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export async function renderFinanceView(containerEl, currentSession, trySyncCb) {
  // main structure including chart canvas and some extra metadata
  containerEl.innerHTML = `
    <div class="row" style="display:flex; gap:12px; flex-wrap:wrap; align-items:stretch;">
      <div class="card" style="flex:1; min-width:280px;">
        <h3 style="margin:0 0 8px;">Resumo</h3>
        <div id="finSummary" class="muted">Carregando…</div>
      </div>

      <div class="card" style="flex:1; min-width:280px;">
        <h3 style="margin:0 0 8px;">Nova Tag</h3>
        <form id="finTagForm" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <input id="finTagName" placeholder="Nome (ex: Moradia)" style="flex:1; min-width:180px;" />
          <input id="finTagColor" type="color" value="#3B82F6" />
          <button class="btn" type="submit">Salvar Tag</button>
        </form>
        <div id="finTags" style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;"></div>
      </div>
    </div>

    <div class="card" style="margin-top:12px;">
      <h3 style="margin:0 0 8px;">Novo Compromisso</h3>

      <form id="finCommitForm" style="display:grid; grid-template-columns: 1fr 180px 200px; gap:10px;">
        <input id="finTitle" placeholder="Título (ex: Notebook)" />
        <input id="finAmount" type="number" step="0.01" placeholder="Valor (ex: 199.90)" />
        <select id="finType">
          <option value="installment">Parcelado</option>
          <option value="recurring">Recorrente (mensal)</option>
          <option value="one_time">Único</option>
        </select>

        <input id="finStartDate" type="date" />
        <input id="finInstallments" type="number" min="1" placeholder="Parcelas (ex: 12)" />
        <input id="finDayOfMonth" type="number" min="1" max="31" placeholder="Dia mês (ex: 5)" />

        <div style="grid-column: 1 / -1; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div class="muted">Selecione tags:</div>
          <div id="finTagPicker" style="display:flex; gap:6px; flex-wrap:wrap;"></div>
        </div>

        <div style="grid-column: 1 / -1; display:flex; gap:10px; align-items:center;">
          <button class="btn" type="submit">Criar + Gerar parcelas</button>
          <span id="finCreateMsg" class="muted"></span>
        </div>
      </form>
    </div>

    <div class="card" style="margin-top:12px;">
      <h3 style="margin:0 0 8px;">Parcelas futuras (linha do tempo)</h3>
      <div id="finTimeline" class="muted">Carregando…</div>
    </div>

    <div class="card" style="margin-top:12px;">
      <h3 style="margin:0 0 8px;">Gráfico de despesas</h3>
      <canvas id="finChart" style="width:100%;height:240px;"></canvas>
    </div>
  `;

  const user = currentSession?.user;
  if (!user) {
    containerEl.innerHTML = `<div class="muted">Você precisa estar logado.</div>`;
    return;
  }

  // Estado local simples
  let state = await getLocalFinanceSnapshot() || { tags: [], commitments: [], occurrences: [], links: [] };
  let selectedTagIds = new Set();
  let chartRenderScheduled = false;

  // desenha gráfico de barras mensal
  function renderChart() {
    if (chartRenderScheduled) return;
    chartRenderScheduled = true;

    // Aguarda a próxima frame para evitar conflitos
    requestAnimationFrame(() => {
      const ctx = containerEl.querySelector('#finChart')?.getContext('2d');
      if (!ctx) {
        chartRenderScheduled = false;
        return;
      }

      // Destrói o gráfico anterior se existir
      if (window.__finChart) {
        window.__finChart.destroy();
        window.__finChart = null;
      }

      const occ = [...state.occurrences].filter(o => o.status !== 'skipped');
      const monthly = {};
      for (const o of occ) {
        const k = byMonthKey(o.due_date);
        monthly[k] = (monthly[k] || 0) + Number(o.amount || 0);
      }
      const labels = Object.keys(monthly).sort();
      const data = labels.map(l => monthly[l]);

      window.__finChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Total', data, backgroundColor: 'rgba(96,165,250,0.7)' }] },
        options: { responsive: true, maintainAspectRatio: false }
      });

      chartRenderScheduled = false;
    });
  }

  function renderTags() {
    const tagsEl = containerEl.querySelector('#finTags');
    const pickerEl = containerEl.querySelector('#finTagPicker');
    tagsEl.innerHTML = '';
    pickerEl.innerHTML = '';

    for (const t of state.tags) {
      const chip = document.createElement('span');
      chip.textContent = t.name;
      chip.style.padding = '4px 8px';
      chip.style.borderRadius = '999px';
      chip.style.background = t.color_hex;
      chip.style.color = '#fff';
      chip.style.fontSize = '12px';
      tagsEl.appendChild(chip);

      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'btn secondary';
      pick.textContent = t.name;
      pick.style.borderLeft = `10px solid ${t.color_hex}`;
      pick.addEventListener('click', () => {
        if (selectedTagIds.has(t.id)) selectedTagIds.delete(t.id);
        else selectedTagIds.add(t.id);

        pick.style.opacity = selectedTagIds.has(t.id) ? '1' : '0.55';
      });
      pick.style.opacity = selectedTagIds.has(t.id) ? '1' : '0.55';
      pickerEl.appendChild(pick);
    }
  }

  function renderSummaryAndTimeline() {
    // resumo 30/90 dias
    const now = new Date();
    const d30 = new Date(now); d30.setDate(d30.getDate() + 30);
    const d90 = new Date(now); d90.setDate(d90.getDate() + 90);

    const isoNow = now.toISOString().slice(0, 10);
    const iso30 = d30.toISOString().slice(0, 10);
    const iso90 = d90.toISOString().slice(0, 10);

    const occ = [...state.occurrences].filter(o => o.status !== 'skipped');

    const sumBetween = (a, b) =>
      occ
        .filter(o => o.due_date >= a && o.due_date <= b)
        .reduce((acc, o) => acc + Number(o.amount || 0), 0);

    const next = occ
      .filter(o => o.due_date >= isoNow && o.status === 'planned')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

    const sEl = containerEl.querySelector('#finSummary');
    sEl.innerHTML = `
      <div><b>Próx. 30 dias:</b> ${money(sumBetween(isoNow, iso30))}</div>
      <div><b>Próx. 90 dias:</b> ${money(sumBetween(isoNow, iso90))}</div>
      <div style="margin-top:6px;"><b>Próximo vencimento:</b> ${
        next ? `${next.due_date} — ${money(next.amount)}` : '—'
      }</div>
    `;

    // timeline por mês
    const groups = new Map();
    for (const o of occ) {
      const k = byMonthKey(o.due_date);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    }

    const keys = [...groups.keys()].sort();
    const tlEl = containerEl.querySelector('#finTimeline');

    if (!keys.length) {
      tlEl.textContent = 'Sem ocorrências ainda. Crie um compromisso acima.';
      tlEl.className = 'muted';
      renderChart();
      return;
    }

    tlEl.className = '';
    tlEl.innerHTML = '';

    for (const k of keys) {
      const monthBox = document.createElement('div');
      monthBox.style.marginBottom = '12px';

      const h = document.createElement('div');
      h.style.fontWeight = '700';
      h.style.marginBottom = '6px';
      h.textContent = monthLabel(k);

      const list = document.createElement('div');
      list.style.display = 'grid';
      list.style.gap = '6px';

      const items = groups.get(k).sort((a, b) => a.due_date.localeCompare(b.due_date));

      for (const o of items) {
        const row = document.createElement('div');
        row.className = 'item';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';

        const left = document.createElement('div');
        const c = state.commitments.find(x => x.id === o.commitment_id);
        // gather tags for this commitment
        const tags = state.links
          .filter(l => l.commitment_id === c?.id)
          .map(l => state.tags.find(t => t.id === l.tag_id))
          .filter(Boolean);

        let metaHtml = `<div class="meta">${o.status === 'paid' ? 'Pago' : 'Pendente'}</div>`;
        if (c) {
          if (c.type === 'installment' && c.installments_count) {
            metaHtml += `<div class="meta">${c.installments_count}x</div>`;
          }
          if (c.type === 'recurring' && c.day_of_month) {
            metaHtml += `<div class="meta">mensal, dia ${c.day_of_month}</div>`;
          }
        }

        if (tags.length) {
          const tagNames = tags.map(t => t.name).join(', ');
          metaHtml += `<div class="meta" style="margin-top:4px;">Tags: ${tagNames}</div>`;
        }

        left.innerHTML = `<div class="content">${o.due_date} — ${c?.title || 'Compromisso'}</div>
                          ${metaHtml}`;

        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.gap = '8px';
        right.style.alignItems = 'center';

        const value = document.createElement('div');
        value.style.fontWeight = '700';
        value.textContent = money(o.amount);

        const btnPay = document.createElement('button');
        btnPay.className = 'btn secondary';
        btnPay.type = 'button';
        btnPay.textContent = o.status === 'paid' ? 'Pago ✓' : 'Marcar pago';
        btnPay.disabled = o.status === 'paid';

        btnPay.addEventListener('click', async () => {
          const updated = {
            ...o,
            status: 'paid',
            paid_at: new Date().toISOString()
          };
          await saveFinanceOccurrenceOptimistic(updated);
          state.occurrences = state.occurrences.map(x => x.id === o.id ? updated : x);
          renderSummaryAndTimeline();
          await trySyncCb();
        });

        right.appendChild(value);
        right.appendChild(btnPay);

        row.appendChild(left);
        row.appendChild(right);

        list.appendChild(row);
      }

      monthBox.appendChild(h);
      monthBox.appendChild(list);
      tlEl.appendChild(monthBox);
    }

    // after rebuilding timeline, always regenerate chart
    renderChart();
  }

  // TAG FORM
  containerEl.querySelector('#finTagForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = containerEl.querySelector('#finTagName').value.trim();
    const color_hex = containerEl.querySelector('#finTagColor').value;
    if (!name) return;

    const tag = {
      id: crypto.randomUUID(),
      user_id: user.id,
      name,
      color_hex,
      created_at: new Date().toISOString()
    };

    await saveFinanceTagOptimistic(tag);
    state.tags.push(tag);
    containerEl.querySelector('#finTagName').value = '';
    renderTags();
    await trySyncCb();
  });

  // COMMIT FORM
  containerEl.querySelector('#finCommitForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = containerEl.querySelector('#finTitle').value.trim();
    const amount = Number(containerEl.querySelector('#finAmount').value || 0);
    const type = containerEl.querySelector('#finType').value;
    const start_date = containerEl.querySelector('#finStartDate').value;

    const installments_count = Number(containerEl.querySelector('#finInstallments').value || 0) || null;
    const day_of_month = Number(containerEl.querySelector('#finDayOfMonth').value || 0) || null;

    const msg = containerEl.querySelector('#finCreateMsg');
    msg.textContent = '';

    if (!title || !amount || !start_date) {
      msg.textContent = 'Preencha título, valor e data inicial.';
      return;
    }

    if (type === 'installment' && !installments_count) {
      msg.textContent = 'Informe o número de parcelas.';
      return;
    }

    if (type === 'recurring' && !day_of_month) {
      msg.textContent = 'Informe o dia do mês (1-31).';
      return;
    }

    const commitment = {
      id: crypto.randomUUID(),
      user_id: user.id,
      title,
      type,
      amount,
      start_date,
      installments_count: type === 'installment' ? installments_count : null,
      day_of_month: type === 'recurring' ? day_of_month : null,
      notes: null,
      created_at: new Date().toISOString()
    };

    // salva compromisso
    await saveFinanceCommitmentOptimistic(commitment);
    state.commitments.push(commitment);

    // liga tags
    for (const tagId of selectedTagIds) {
      const row = {
        commitment_id: commitment.id,
        tag_id: tagId,
        user_id: user.id,
        created_at: new Date().toISOString()
      };
      await saveFinanceCommitmentTagOptimistic(row);
      state.links.push(row);
    }
    selectedTagIds = new Set(); // reset seleção

    // gera ocorrências e salva
    const occs = generateOccurrencesForCommitment(commitment, 12);
    for (const o of occs) {
      await saveFinanceOccurrenceOptimistic(o);
      state.occurrences.push(o);
    }

    // reset form
    containerEl.querySelector('#finTitle').value = '';
    containerEl.querySelector('#finAmount').value = '';
    containerEl.querySelector('#finStartDate').value = '';
    containerEl.querySelector('#finInstallments').value = '';
    containerEl.querySelector('#finDayOfMonth').value = '';

    renderTags();
    renderSummaryAndTimeline();
    msg.textContent = 'Criado!';

    await trySyncCb();
  });

  // render inicial
  renderTags();
  renderSummaryAndTimeline();
}