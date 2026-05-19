'use strict';
const { suite, test } = require('node:test');
const assert          = require('node:assert/strict');
const vm              = require('node:vm');
const { carregar }    = require('./_helpers.js');

// CPF válido para os testes: 529.982.247-25
const CPF_VALIDO_FORMATADO  = '529.982.247-25';
const CPF_VALIDO_DIGITS     = '52998224725';
const CPF_INVALIDO_DIG      = '123.456.789-00';
const CPF_TODOS_IGUAIS      = '111.111.111-11';

/** Carrega InputValidator + DataProcessor no mesmo sandbox (dependência global). */
function criarDP() {
  const sandbox = vm.createContext({ console });
  carregar(sandbox, 'shared/js/InputValidator.js');
  carregar(sandbox, 'shared/js/DataProcessor.js');
  return sandbox.DataProcessor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1 — DataProcessor.validateCPF()
// ─────────────────────────────────────────────────────────────────────────────

suite('DataProcessor.validateCPF()', () => {

  test('CPF válido com máscara → ok:true, valor somente dígitos', () => {
    const DP = criarDP();
    const r  = DP.validateCPF(CPF_VALIDO_FORMATADO);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, CPF_VALIDO_DIGITS);
  });

  test('CPF válido sem máscara → ok:true, valor idêntico', () => {
    const DP = criarDP();
    const r  = DP.validateCPF(CPF_VALIDO_DIGITS);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, CPF_VALIDO_DIGITS);
  });

  test('CPF sujo com chars extras ($$$) → strip e valida normalmente', () => {
    const DP = criarDP();
    const r  = DP.validateCPF(`${CPF_VALIDO_FORMATADO}$$$`);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, CPF_VALIDO_DIGITS);
  });

  test('CPF com dígito verificador errado → ok:false', () => {
    const DP = criarDP();
    const r  = DP.validateCPF(CPF_INVALIDO_DIG);
    assert.strictEqual(r.ok, false);
    assert.ok(r.msg.length > 0);
  });

  test('CPF com todos os dígitos iguais → ok:false', () => {
    const DP = criarDP();
    const r  = DP.validateCPF(CPF_TODOS_IGUAIS);
    assert.strictEqual(r.ok, false);
  });

  test('CPF vazio → ok:false', () => {
    const DP = criarDP();
    assert.strictEqual(DP.validateCPF('').ok, false);
  });

  test('CPF null → ok:false (sem lançar exceção)', () => {
    const DP = criarDP();
    assert.doesNotThrow(() => {
      const r = DP.validateCPF(null);
      assert.strictEqual(r.ok, false);
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2 — DataProcessor.validateEmail()
// ─────────────────────────────────────────────────────────────────────────────

suite('DataProcessor.validateEmail()', () => {

  test('email válido minúsculo → ok:true, valor idêntico', () => {
    const DP = criarDP();
    const r  = DP.validateEmail('usuario@email.com');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, 'usuario@email.com');
  });

  test('email com maiúsculas → ok:true, valor normalizado para lowercase', () => {
    const DP = criarDP();
    const r  = DP.validateEmail('USUARIO@EMAIL.COM');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, 'usuario@email.com');
  });

  test('email com espaços nas bordas → ok:true, valor trimado e lowercase', () => {
    const DP = criarDP();
    const r  = DP.validateEmail('  Teste@Mail.com  ');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, 'teste@mail.com');
  });

  test('email sem @ → ok:false', () => {
    const DP = criarDP();
    const r  = DP.validateEmail('invalido.com');
    assert.strictEqual(r.ok, false);
  });

  test('email vazio → ok:false', () => {
    const DP = criarDP();
    assert.strictEqual(DP.validateEmail('').ok, false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3 — DataProcessor.validatePhone()
// ─────────────────────────────────────────────────────────────────────────────

suite('DataProcessor.validatePhone()', () => {

  test('telefone com máscara (11) 91234-5678 → ok:true, valor somente dígitos', () => {
    const DP = criarDP();
    const r  = DP.validatePhone('(11) 91234-5678');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, '11912345678');
  });

  test('telefone 8 dígitos (fixo) → ok:true, valor correto', () => {
    const DP = criarDP();
    const r  = DP.validatePhone('(11) 3333-4444');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, '1133334444');
  });

  test('telefone com código de país 55 → remove 55, retorna 11 dígitos', () => {
    const DP = criarDP();
    const r  = DP.validatePhone('+55 11 91234-5678');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, '11912345678');
  });

  test('telefone sujo com chars extras ($$$) → strip e valida', () => {
    const DP = criarDP();
    const r  = DP.validatePhone('(11) 91234-5678$$$');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.valor, '11912345678');
  });

  test('telefone com poucos dígitos (inválido) → ok:false', () => {
    const DP = criarDP();
    const r  = DP.validatePhone('123456');
    assert.strictEqual(r.ok, false);
  });

  test('telefone vazio → ok:false', () => {
    const DP = criarDP();
    assert.strictEqual(DP.validatePhone('').ok, false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4 — DataProcessor.sanitizeInput()
// ─────────────────────────────────────────────────────────────────────────────

suite('DataProcessor.sanitizeInput()', () => {

  test('texto normal → retorna inalterado (trim)', () => {
    const DP = criarDP();
    assert.strictEqual(DP.sanitizeInput('Av. Paulista, 1000'), 'Av. Paulista, 1000');
  });

  test('remove null bytes (\\0)', () => {
    const DP = criarDP();
    assert.strictEqual(DP.sanitizeInput('texto\0limpo'), 'textolimpo');
  });

  test('remove ponto-e-vírgula ;', () => {
    const DP = criarDP();
    assert.strictEqual(DP.sanitizeInput("SELECT ; DROP"), 'SELECT  DROP');
  });

  test('remove comentário SQL -- inline', () => {
    const DP = criarDP();
    assert.strictEqual(DP.sanitizeInput("texto -- comentário"), 'texto  comentário');
  });

  test('remove bloco de comentário SQL /* */', () => {
    const DP = criarDP();
    assert.strictEqual(DP.sanitizeInput('texto /* injetado */ fim'), 'texto  fim');
  });

  test('remove # e $ e *', () => {
    const DP = criarDP();
    assert.strictEqual(DP.sanitizeInput('valor$#*extra'), 'valorextra');
  });

  test('não-string (número) → retorna string vazia sem lançar exceção', () => {
    const DP = criarDP();
    assert.doesNotThrow(() => {
      const r = DP.sanitizeInput(42);
      assert.strictEqual(typeof r, 'string');
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 5 — DataProcessor.sanitizeOutput()
// ─────────────────────────────────────────────────────────────────────────────

suite('DataProcessor.sanitizeOutput()', () => {

  test('texto limpo → retorna inalterado', () => {
    const DP = criarDP();
    assert.strictEqual(DP.sanitizeOutput('Av. Paulista, 1000'), 'Av. Paulista, 1000');
  });

  test('telefone com chars extras no retorno do banco → retorna somente dígitos-e-letras', () => {
    const DP = criarDP();
    const r  = DP.sanitizeOutput('11912345678$$$');
    assert.strictEqual(r, '11912345678');
  });

  test('CPF com chars extras → remove chars inválidos', () => {
    const DP = criarDP();
    const r  = DP.sanitizeOutput('12345678900###');
    assert.strictEqual(r, '12345678900');
  });

  test('endereço com chars suspeitos → remove chars inválidos mantendo texto válido', () => {
    const DP = criarDP();
    const r  = DP.sanitizeOutput('Av. Paulista$$$, 1000***');
    assert.strictEqual(r, 'Av. Paulista, 1000');
  });

  test('string vazia → retorna string vazia', () => {
    const DP = criarDP();
    assert.strictEqual(DP.sanitizeOutput(''), '');
  });

  test('não-string → retorna string vazia sem lançar exceção', () => {
    const DP = criarDP();
    assert.doesNotThrow(() => {
      const r = DP.sanitizeOutput(null);
      assert.strictEqual(r, '');
    });
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 6 — DataProcessor.normalizeData()
// ─────────────────────────────────────────────────────────────────────────────

suite('DataProcessor.normalizeData()', () => {

  test('objeto com cpf normaliza para somente dígitos', () => {
    const DP = criarDP();
    const r  = DP.normalizeData({ cpf: CPF_VALIDO_FORMATADO });
    assert.strictEqual(r.cpf, CPF_VALIDO_DIGITS);
  });

  test('objeto com email normaliza para lowercase', () => {
    const DP = criarDP();
    const r  = DP.normalizeData({ email: 'USUARIO@EMAIL.COM' });
    assert.strictEqual(r.email, 'usuario@email.com');
  });

  test('objeto com phone normaliza para somente dígitos sem código 55', () => {
    const DP = criarDP();
    const r  = DP.normalizeData({ phone: '+55 11 91234-5678' });
    assert.strictEqual(r.phone, '11912345678');
  });

  test('objeto com telefone (pt) normaliza corretamente', () => {
    const DP = criarDP();
    const r  = DP.normalizeData({ telefone: '(11) 91234-5678' });
    assert.strictEqual(r.telefone, '11912345678');
  });

  test('objeto com address sanitiza a entrada', () => {
    const DP = criarDP();
    const r  = DP.normalizeData({ address: 'Av. Paulista$$$, 1000' });
    assert.strictEqual(r.address, 'Av. Paulista, 1000');
  });

  test('objeto com endereco (pt) sanitiza a entrada', () => {
    const DP = criarDP();
    const r  = DP.normalizeData({ endereco: 'Rua Teste; 123' });
    assert.strictEqual(r.endereco, 'Rua Teste 123');
  });

  test('campos desconhecidos são sanitizados mas mantidos no retorno', () => {
    const DP = criarDP();
    const r  = DP.normalizeData({ nome: 'João$$$', age: 30 });
    assert.strictEqual(r.nome, 'João');
    assert.strictEqual(r.age, 30);
  });

  test('retorna novo objeto (não muta o original)', () => {
    const DP    = criarDP();
    const input = { email: 'TEST@MAIL.COM' };
    const r     = DP.normalizeData(input);
    assert.strictEqual(input.email, 'TEST@MAIL.COM'); // original intacto
    assert.strictEqual(r.email,     'test@mail.com');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 7 — DataProcessor.processInput()
// ─────────────────────────────────────────────────────────────────────────────

suite('DataProcessor.processInput()', () => {

  test('objeto totalmente válido → ok:true, errors:{}, data normalizado', () => {
    const DP = criarDP();
    const r  = DP.processInput({
      cpf:     CPF_VALIDO_FORMATADO,
      email:   'USUARIO@EMAIL.COM',
      phone:   '(11) 91234-5678',
      address: 'Av. Paulista, 1000',
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(Object.keys(r.errors).length, 0);
    assert.strictEqual(r.data.cpf,   CPF_VALIDO_DIGITS);
    assert.strictEqual(r.data.email, 'usuario@email.com');
    assert.strictEqual(r.data.phone, '11912345678');
  });

  test('CPF inválido → ok:false, errors.cpf preenchido', () => {
    const DP = criarDP();
    const r  = DP.processInput({ cpf: CPF_INVALIDO_DIG });
    assert.strictEqual(r.ok, false);
    assert.ok(typeof r.errors.cpf === 'string' && r.errors.cpf.length > 0);
  });

  test('múltiplos campos inválidos → todos os erros coletados (não para no primeiro)', () => {
    const DP = criarDP();
    const r  = DP.processInput({
      cpf:   CPF_INVALIDO_DIG,
      email: 'invalido',
      phone: '123',
    });
    assert.strictEqual(r.ok, false);
    assert.ok('cpf'   in r.errors);
    assert.ok('email' in r.errors);
    assert.ok('phone' in r.errors);
  });

  test('campo email inexistente no objeto → não aparece em errors', () => {
    const DP = criarDP();
    const r  = DP.processInput({ cpf: CPF_VALIDO_DIGITS });
    assert.strictEqual(r.ok, true);
    assert.ok(!('email' in r.errors));
  });

  test('campos desconhecidos são sanitizados e mantidos no data', () => {
    const DP = criarDP();
    const r  = DP.processInput({ nome: 'João$$$', role: 'client' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.data.nome, 'João');
  });

  test('objeto vazio → ok:true (sem campos obrigatórios), data {}', () => {
    const DP = criarDP();
    const r  = DP.processInput({});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(Object.keys(r.errors).length, 0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 8 — DataProcessor.processOutput()
// ─────────────────────────────────────────────────────────────────────────────

suite('DataProcessor.processOutput()', () => {

  test('dados limpos → data igual ao original, warnings vazio', () => {
    const DP    = criarDP();
    const input = { cpf: CPF_VALIDO_DIGITS, email: 'usuario@email.com' };
    const r     = DP.processOutput(input);
    assert.strictEqual(r.data.cpf,   CPF_VALIDO_DIGITS);
    assert.strictEqual(r.data.email, 'usuario@email.com');
    assert.strictEqual(r.warnings.length, 0);
  });

  test('telefone sujo vindo do banco → limpo no data, warning gerado', () => {
    const DP = criarDP();
    const r  = DP.processOutput({ phone: '11912345678$$$' });
    assert.strictEqual(r.data.phone, '11912345678');
    assert.strictEqual(r.warnings.length, 1);
    assert.ok(r.warnings[0].includes('phone'));
  });

  test('CPF sujo vindo do banco → limpo no data, warning gerado', () => {
    const DP = criarDP();
    const r  = DP.processOutput({ cpf: `${CPF_VALIDO_DIGITS}###` });
    assert.strictEqual(r.data.cpf, CPF_VALIDO_DIGITS);
    assert.strictEqual(r.warnings.length, 1);
    assert.ok(r.warnings[0].includes('cpf'));
  });

  test('múltiplos campos sujos → múltiplos warnings', () => {
    const DP = criarDP();
    const r  = DP.processOutput({
      cpf:   `${CPF_VALIDO_DIGITS}###`,
      phone: '11912345678$$$',
    });
    assert.strictEqual(r.warnings.length, 2);
  });

  test('não lança exceção mesmo com campos null/undefined', () => {
    const DP = criarDP();
    assert.doesNotThrow(() => {
      const r = DP.processOutput({ cpf: null, email: undefined });
      assert.ok(Array.isArray(r.warnings));
    });
  });

  test('retorna novo objeto (não muta o original)', () => {
    const DP    = criarDP();
    const input = { phone: '11912345678$$$' };
    DP.processOutput(input);
    assert.strictEqual(input.phone, '11912345678$$$'); // original intacto
  });

});
