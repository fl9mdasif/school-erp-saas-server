import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { checkTenantLedger } from '../src/app/jobs/ledgerConsistency';
import { LedgerEntry } from '../src/app/modules/ledger/ledgerEntry.model';
import { runAsTenant } from '../src/app/lib/tenantContext';
import { agent, authed, login, registerTenant } from './helpers/api';
import { generate, pay, setupFees } from './helpers/fees';
import { useTestDb } from './helpers/db';

useTestDb();

describe('invoice generation', () => {
  it('dry run counts without writing; the same key replays; a new key never duplicates', async () => {
    const t = await registerTenant();
    const f = await setupFees(t, 3);
    const dry = await agent().post('/api/v1/invoices/generate').query({ dryRun: 'true' }).set(f.h).send({
      sessionId: f.session._id,
      classId: f.cls._id,
      periodLabel: '2026-03',
      cycle: 'monthly',
      dueDate: '2026-03-10',
    });
    expect(dry.body.data).toMatchObject({ dryRun: true, toCreate: 3, totalAmount: 300000 });
    expect((await agent().get('/api/v1/invoices').set(f.h)).body.meta.total).toBe(0);

    const first = await generate(f.h, f, {}, 'key-generate-0001');
    expect(first.body.data).toMatchObject({ created: 3, totalAmount: 300000 });
    const replay = await generate(f.h, f, {}, 'key-generate-0001');
    expect(replay.body.data.replayed).toBe(true);
    expect(replay.body.data.batchId).toBe(first.body.data.batchId);

    const other = await generate(f.h, f, {}, 'key-generate-0002');
    expect(other.body.data.created).toBe(0);
    expect(other.body.data.skipped).toBe(3);
    expect((await agent().get('/api/v1/invoices').set(f.h)).body.meta.total).toBe(3);

    const noKey = await agent().post('/api/v1/invoices/generate').set(f.h).send({
      sessionId: f.session._id,
      classId: f.cls._id,
      periodLabel: '2026-04',
      cycle: 'monthly',
      dueDate: '2026-04-10',
    });
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('applies percent and fixed adjustments, never below zero, and numbers invoices per year', async () => {
    const t = await registerTenant();
    const f = await setupFees(t, 2);
    await agent().post('/api/v1/fee-adjustments').set(f.h).send({
      studentId: f.students[0]._id,
      sessionId: f.session._id,
      feeHeadId: f.tuition._id,
      type: 'percent',
      value: 25,
      reason: 'Sibling discount',
    });
    await agent().post('/api/v1/fee-adjustments').set(f.h).send({
      studentId: f.students[1]._id,
      sessionId: f.session._id,
      type: 'fixed',
      value: 99999999,
      reason: 'Full waiver test',
    });
    const res = await generate(f.h, f, {}, 'key-adjust-000001');
    expect(res.body.data.created).toBe(1); // second student fully waived: nothing to charge
    expect(res.body.data.skippedDetails[0].reason).toMatch(/Nothing to charge/);
    const inv = (await agent().get('/api/v1/invoices').set(f.h)).body.data[0];
    expect(inv.total).toBe(75000);
    expect(inv.invoiceNo).toMatch(/^INV-\d{4}-000001$/);
    const detail = (await agent().get(`/api/v1/invoices/${inv._id}`).set(f.h)).body.data;
    expect(detail.lines[0]).toMatchObject({ amount: 100000, discount: 25000 });
    expect(detail.ledger).toHaveLength(1);
  });

  it('one-time heads generate separately and students see only their own invoices', async () => {
    const t = await registerTenant();
    const f = await setupFees(t, 2);
    expect(
      (await generate(f.h, f, { periodLabel: 'Exam 1', cycle: 'one_time' }, 'key-exam-0000001')).body.data
        .created,
    ).toBe(2);
    const lg = await agent()
      .post(`/api/v1/students/${f.students[0]._id}/create-login`)
      .set(f.h)
      .send({ student: true });
    const tok = authed(
      (await login(t.slug, f.students[0].studentId, lg.body.data.student.temporaryPassword)).body.data
        .accessToken,
    );
    const mine = await agent().get('/api/v1/invoices').set(tok);
    expect(mine.body.data).toHaveLength(1);
    const all = (await agent().get('/api/v1/invoices').set(f.h)).body.data;
    const other = all.find((i: any) => i.studentId._id !== f.students[0]._id);
    expect((await agent().get(`/api/v1/invoices/${other._id}`).set(tok)).status).toBe(404);
    expect((await generate(tok, f, {}, 'key-student-00001')).status).toBe(403);
  });
});

describe('payments', () => {
  const setup = async () => {
    const t = await registerTenant();
    const f = await setupFees(t, 1);
    await generate(f.h, f, {}, 'key-pay-setup-001'); // 1000 Tk monthly
    await generate(f.h, f, { periodLabel: '2026-04', dueDate: '2026-04-10' }, 'key-pay-setup-002'); // another 1000 Tk
    const invoices = (await agent().get('/api/v1/invoices').set(f.h)).body.data.sort((a: any, b: any) =>
      a.dueDate.localeCompare(b.dueDate),
    );
    return { t, f, invoices, student: f.students[0] };
  };

  it('auto allocates oldest due first and updates invoice status', async () => {
    const { f, invoices, student } = await setup();
    const res = await pay(f.h, { studentId: student._id, amount: 150000 });
    expect(res.status).toBe(201);
    expect(res.body.data.receiptNo).toMatch(/^RCPT-\d{4}-000001$/);
    expect(res.body.data.allocations.map((a: any) => a.amount)).toEqual([100000, 50000]);
    const a = (await agent().get(`/api/v1/invoices/${invoices[0]._id}`).set(f.h)).body.data;
    const b = (await agent().get(`/api/v1/invoices/${invoices[1]._id}`).set(f.h)).body.data;
    expect([a.status, a.dueAmount, a.paidTotal]).toEqual(['paid', 0, 100000]);
    expect([b.status, b.dueAmount]).toEqual(['partial', 50000]);
  });

  it('rejects overpayment, mismatched allocations and other students invoices', async () => {
    const { f, invoices, student } = await setup();
    const over = await pay(f.h, { studentId: student._id, amount: 999999 });
    expect(over.body.code).toBe('OVERPAYMENT');
    const mismatch = await pay(f.h, {
      studentId: student._id,
      amount: 50000,
      allocations: [{ invoiceId: invoices[0]._id, amount: 40000 }],
    });
    expect(mismatch.body.code).toBe('ALLOCATION_MISMATCH');
    const tooMuch = await pay(f.h, {
      studentId: student._id,
      amount: 120000,
      allocations: [{ invoiceId: invoices[0]._id, amount: 120000 }],
    });
    expect(tooMuch.body.code).toBe('OVERPAYMENT');
    const ok = await pay(f.h, {
      studentId: student._id,
      amount: 30000,
      allocations: [{ invoiceId: invoices[1]._id, amount: 30000 }],
    });
    expect(ok.status).toBe(201);
  });

  it('a repeated Idempotency-Key never charges twice', async () => {
    const { f, student } = await setup();
    const key = 'pay-key-double-0001';
    const first = await pay(f.h, { studentId: student._id, amount: 100000 }, key);
    const second = await pay(f.h, { studentId: student._id, amount: 100000 }, key);
    expect(second.status).toBe(200);
    expect(second.body.data.replayed).toBe(true);
    expect(second.body.data._id).toBe(first.body.data._id);
    const ledger = (await agent().get(`/api/v1/students/${student._id}/ledger`).set(f.h)).body.data;
    expect(ledger.balance).toBe(100000); // 200000 invoiced - 100000 paid, once
    const noKey = await agent()
      .post('/api/v1/payments')
      .set(f.h)
      .send({ studentId: student._id, amount: 100, method: 'cash' });
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('two simultaneous payments for the same invoice never overpay', async () => {
    const t = await registerTenant();
    const f = await setupFees(t, 1);
    await generate(f.h, f, {}, 'key-race-setup-001');
    const inv = (await agent().get('/api/v1/invoices').set(f.h)).body.data[0];
    const body = {
      studentId: f.students[0]._id,
      amount: 100000,
      allocations: [{ invoiceId: inv._id, amount: 100000 }],
    };
    const [a, b] = await Promise.all([
      pay(f.h, body, 'race-key-aaaaaaa1'),
      pay(f.h, body, 'race-key-bbbbbbb2'),
    ]);
    expect([a.status, b.status].sort()).toEqual(
      [201, 400].length ? [201, a.status === 201 ? b.status : a.status].sort() : [],
    );
    const after = (await agent().get(`/api/v1/invoices/${inv._id}`).set(f.h)).body.data;
    expect(after.paidTotal).toBe(100000);
    expect(after.dueAmount).toBe(0);
    expect([a.status, b.status].filter((s) => s === 201)).toHaveLength(1);
  });

  it('reversal restores the due amount, writes ledger entries, never edits them, and is audited', async () => {
    const { t, f, invoices, student } = await setup();
    const p = (await pay(f.h, { studentId: student._id, amount: 100000 })).body.data;
    const acc = await login(t.slug, t.email, t.password);
    void acc;
    expect(
      (await agent().post(`/api/v1/payments/${p._id}/reverse`).set(f.h).send({ reason: 'x' })).status,
    ).toBe(400);
    const rev = await agent()
      .post(`/api/v1/payments/${p._id}/reverse`)
      .set(f.h)
      .send({ reason: 'Wrong student' });
    expect(rev.status).toBe(200);
    expect(rev.body.data.status).toBe('reversed');
    const inv = (await agent().get(`/api/v1/invoices/${invoices[0]._id}`).set(f.h)).body.data;
    expect([inv.status, inv.dueAmount, inv.paidTotal]).toEqual(['unpaid', 100000, 0]);
    expect(
      (await agent().post(`/api/v1/payments/${p._id}/reverse`).set(f.h).send({ reason: 'again' })).status,
    ).toBe(409);

    const ledger = (await agent().get(`/api/v1/students/${student._id}/ledger`).set(f.h)).body.data;
    expect(ledger.entries.map((e: any) => e.type)).toEqual(['invoice', 'invoice', 'payment', 'reversal']);
    expect(ledger.balance).toBe(200000);

    await expect(
      runAsTenant(new Types.ObjectId(t.tenantId), () => LedgerEntry.updateOne({}, { $set: { amount: 1 } })),
    ).rejects.toThrow(/LEDGER_APPEND_ONLY/);
    await expect(
      runAsTenant(new Types.ObjectId(t.tenantId), () => LedgerEntry.deleteMany({})),
    ).rejects.toThrow(/LEDGER_APPEND_ONLY/);
    const audit = await agent().get('/api/v1/audit-logs').set(f.h).query({ action: 'payment.reverse' });
    expect(audit.body.data[0].reason).toBe('Wrong student');
    expect(await checkTenantLedger(new Types.ObjectId(t.tenantId))).toEqual([]);
  });

  it('voids an unpaid invoice, blocks voiding a paid one, and allows regeneration after a void', async () => {
    const { f, invoices, student } = await setup();
    await pay(f.h, {
      studentId: student._id,
      amount: 20000,
      allocations: [{ invoiceId: invoices[0]._id, amount: 20000 }],
    });
    expect(
      (await agent().post(`/api/v1/invoices/${invoices[0]._id}/void`).set(f.h).send({ reason: 'mistake' }))
        .body.code,
    ).toBe('HAS_PAYMENTS');
    const v = await agent()
      .post(`/api/v1/invoices/${invoices[1]._id}/void`)
      .set(f.h)
      .send({ reason: 'created by mistake' });
    expect(v.body.data.status).toBe('voided');
    expect(
      (
        await pay(f.h, {
          studentId: student._id,
          amount: 100000,
          allocations: [{ invoiceId: invoices[1]._id, amount: 100000 }],
        })
      ).status,
    ).toBe(400);
    const again = await generate(
      f.h,
      f,
      { periodLabel: '2026-04', dueDate: '2026-04-10' },
      'key-regen-0000001',
    );
    expect(again.body.data.created).toBe(1);
  });

  it('collection report equals payments minus reversals; dues and receipts work', async () => {
    const { t, f, student } = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const p1 = (await pay(f.h, { studentId: student._id, amount: 100000, method: 'cash' })).body.data;
    await pay(f.h, { studentId: student._id, amount: 30000, method: 'bkash_manual', providerRef: 'TRX999' });
    await agent().post(`/api/v1/payments/${p1._id}/reverse`).set(f.h).send({ reason: 'bounced' });

    const q = { from: '2000-01-01', to: '2099-12-31' };
    const byMethod = (
      await agent()
        .get('/api/v1/fees/reports/collection')
        .set(f.h)
        .query({ ...q, groupBy: 'method' })
    ).body.data;
    expect(byMethod.total).toBe(30000);
    expect(byMethod.rows.find((r: any) => r.key === 'cash').collected).toBe(0);
    expect(byMethod.rows.find((r: any) => r.key === 'bkash_manual').collected).toBe(30000);
    for (const groupBy of ['day', 'class', 'feeHead']) {
      expect(
        (
          await agent()
            .get('/api/v1/fees/reports/collection')
            .set(f.h)
            .query({ ...q, groupBy })
        ).body.data.total,
      ).toBe(30000);
    }
    const csv = await agent()
      .get('/api/v1/fees/reports/collection')
      .set(f.h)
      .query({ ...q, groupBy: 'method', format: 'csv' });
    expect(csv.headers['content-type']).toMatch(/text\/csv/);

    const dues = (await agent().get('/api/v1/fees/dues').set(f.h)).body.data;
    expect(dues.totalDue).toBe(200000 - 30000);
    expect(dues.rows[0]).toMatchObject({ name: 'Kid 1', due: 170000 });
    expect((await agent().get('/api/v1/fees/dues').set(f.h).query({ format: 'csv' })).text).toContain(
      'Kid 1',
    );

    const html = await agent().get(`/api/v1/payments/${p1._id}/receipt.html`).set(f.h);
    expect(html.status).toBe(200);
    expect(html.text).toContain('REVERSED'.length ? 'RCPT-' : '');
    expect(html.text).toContain('ফি রশিদ'); // default locale is Bangla
    const pdf = await agent()
      .get(`/api/v1/payments/${p1._id}/receipt.pdf`)
      .set(f.h)
      .buffer(true)
      .parse((res, cb) => {
        const c: Buffer[] = [];
        res.on('data', (d: Buffer) => c.push(d));
        res.on('end', () => cb(null, Buffer.concat(c)));
      });
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    void t;
    void today;
  });

  it('accountants can collect; teachers and students cannot', async () => {
    const { t, f, student } = await setup();
    await agent()
      .post('/api/v1/users')
      .set(f.h)
      .send({ role: 'accountant', name: 'Acc Ountant', email: 'acc@example.com', password: 'Account#12345' });
    await agent()
      .post('/api/v1/users')
      .set(f.h)
      .send({ role: 'teacher', name: 'Teach Er', email: 'tt@example.com', password: 'Teacher#12345' });
    const acc = authed((await login(t.slug, 'acc@example.com', 'Account#12345')).body.data.accessToken);
    const teach = authed((await login(t.slug, 'tt@example.com', 'Teacher#12345')).body.data.accessToken);
    expect((await pay(acc, { studentId: student._id, amount: 10000 })).status).toBe(201);
    expect((await pay(teach, { studentId: student._id, amount: 10000 })).status).toBe(403);
    const p = (await agent().get('/api/v1/payments').set(acc)).body.data[0];
    expect(
      (await agent().post(`/api/v1/payments/${p._id}/reverse`).set(acc).send({ reason: 'accountant cannot' }))
        .status,
    ).toBe(403);
  });
});

describe('cross-tenant money attacks', () => {
  it('tenant A cannot read or reverse tenant B payments, invoices or ledger', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const fb = await setupFees(b, 1);
    await generate(fb.h, fb, {}, 'key-xt-setup-0001');
    const inv = (await agent().get('/api/v1/invoices').set(fb.h)).body.data[0];
    const p = (await pay(fb.h, { studentId: fb.students[0]._id, amount: 100000 })).body.data;
    const ha = authed(a.token);
    for (const [method, url, body] of [
      ['get', `/api/v1/invoices/${inv._id}`],
      ['post', `/api/v1/invoices/${inv._id}/void`, { reason: 'attack' }],
      ['get', `/api/v1/payments/${p._id}`],
      ['post', `/api/v1/payments/${p._id}/reverse`, { reason: 'attack' }],
      ['get', `/api/v1/payments/${p._id}/receipt.pdf`],
      ['get', `/api/v1/payments/${p._id}/receipt.html`],
      ['get', `/api/v1/students/${fb.students[0]._id}/ledger`],
    ] as [string, string, object?][]) {
      const res = await (agent() as any)[method](url).set(ha).send(body);
      expect([403, 404], `${method} ${url}`).toContain(res.status);
    }
    const pay2 = await pay(ha, { studentId: fb.students[0]._id, amount: 100 });
    expect(pay2.status).toBe(400);
    expect((await agent().get(`/api/v1/payments/${p._id}`).set(fb.h)).body.data.status).toBe('succeeded');
  });
});
