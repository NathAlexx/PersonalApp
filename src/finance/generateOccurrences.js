function addMonths(date, months) {
  const d = new Date(date);
  const originalDay = d.getDate();
  d.setMonth(d.getMonth() + months);

  // Se o mês não tem o dia (ex: 31), volta pro último dia do mês anterior
  if (d.getDate() < originalDay) d.setDate(0);
  return d;
}

function toISODate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function generateOccurrencesForCommitment(commitment, monthsAhead = 12) {
  const start = new Date(`${commitment.start_date}T00:00:00`);
  const amount = Number(commitment.amount);
  const results = [];

  if (commitment.type === 'one_time') {
    results.push({
      id: crypto.randomUUID(),
      user_id: commitment.user_id,
      commitment_id: commitment.id,
      due_date: commitment.start_date,
      amount,
      status: 'planned',
      paid_at: null,
      created_at: new Date().toISOString()
    });
    return results;
  }

  if (commitment.type === 'installment') {
    const n = Number(commitment.installments_count || 1);
    for (let i = 0; i < n; i++) {
      const due = addMonths(start, i);
      results.push({
        id: crypto.randomUUID(),
        user_id: commitment.user_id,
        commitment_id: commitment.id,
        due_date: toISODate(due),
        amount,
        status: 'planned',
        paid_at: null,
        created_at: new Date().toISOString()
      });
    }
    return results;
  }

  // recurring (mensal)
  if (commitment.type === 'recurring') {
    const desiredDay = Number(commitment.day_of_month || start.getDate());
    const base = new Date(start);

    // Tenta colocar no dia desejado sem quebrar (ex: 31)
    base.setDate(Math.min(desiredDay, 28));

    for (let i = 0; i < monthsAhead; i++) {
      const due = addMonths(base, i);

      // tenta restaurar o dia desejado
      const d2 = new Date(due);
      const lastDay = new Date(d2.getFullYear(), d2.getMonth() + 1, 0).getDate();
      d2.setDate(Math.min(desiredDay, lastDay));

      results.push({
        id: crypto.randomUUID(),
        user_id: commitment.user_id,
        commitment_id: commitment.id,
        due_date: toISODate(d2),
        amount,
        status: 'planned',
        paid_at: null,
        created_at: new Date().toISOString()
      });
    }
  }

  return results;
}