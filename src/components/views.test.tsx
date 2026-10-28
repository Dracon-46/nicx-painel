import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { niceStep, yTicks } from './charts';
import { LoginView } from './LoginView';

afterEach(cleanup);

describe('eixos dos gráficos', () => {
  it('usa passos redondos e inteiros', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(3)).toBe(1);
    expect(niceStep(37)).toBe(10);
    expect(yTicks(37)).toEqual([0, 10, 20, 30, 40]);
    expect(yTicks(0)).toEqual([0, 1]);
  });
});

describe('tela de login', () => {
  function fakeAuth(result: { error: unknown }) {
    const signInWithPassword = vi.fn().mockResolvedValue(result);
    const client = { auth: { signInWithPassword } } as unknown as SupabaseClient;
    return { client, signInWithPassword };
  }

  it('só tem login: nenhuma opção de criar conta', () => {
    const { client } = fakeAuth({ error: null });
    render(<LoginView client={client} />);
    expect(screen.getByRole('button', { name: /entrar no painel/i })).toBeTruthy();
    expect(screen.queryByText(/criar conta/i)).toBeNull();
    expect(screen.queryByText(/cadastr(ar|e-se)/i)).toBeNull();
  });

  it('entra com e-mail e senha', async () => {
    const { client, signInWithPassword } = fakeAuth({ error: null });
    render(<LoginView client={client} />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' admin@falkyria.com ' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'uma-senha-longa' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar no painel/i }));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledWith({ email: 'admin@falkyria.com', password: 'uma-senha-longa' }),
    );
  });

  it('mostra o erro em português', async () => {
    const { client } = fakeAuth({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } });
    render(<LoginView client={client} />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar no painel/i }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('E-mail ou senha incorretos.');
  });

  it('o botão do olho mostra e esconde a senha', () => {
    const { client } = fakeAuth({ error: null });
    render(<LoginView client={client} />);
    const senha = screen.getByLabelText('Senha') as HTMLInputElement;
    expect(senha.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar a senha' }));
    expect(senha.type).toBe('text');
  });
});

describe('QR do segundo fator', () => {
  it('codifica o SVG mesmo quando o supabase-js já pôs o prefixo cru', async () => {
    const { qrSource } = await import('./MfaView');
    const svg = '<svg><rect fill="#fff"/></svg>';
    const expected = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    expect(qrSource(`data:image/svg+xml;utf-8,${svg}`)).toBe(expected);
    expect(qrSource(svg)).toBe(expected);
    expect(qrSource('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});
