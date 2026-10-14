import type { Me } from '@mgcred/shared';
import { api } from './api.ts';
import { AsyncForm } from './portal.tsx';

export function Login({ activationToken, onLogin, onActivated, notice }: {
  activationToken: string; onLogin: (user: Me, csrf: string) => Promise<void>; onActivated: () => void; notice: string;
}) {
  const activating = !!activationToken;
  return (
    <div className="login-shell">
      <section className="login-card">
        <img src="/assets/mgcred-logo.webp" alt="MG Cred" />
        <h1>{activating ? 'Defina sua senha' : 'Jurídico MG Cred'}</h1>
        <p className="muted">{activating ? 'Use uma frase-senha exclusiva com pelo menos 14 caracteres.' : 'Entre com o acesso fornecido pelo Jurídico.'}</p>
        {notice && <p className="result-summary">{notice}</p>}
        <AsyncForm onSubmit={async v => {
          if (activating) {
            if (v.password !== v.confirm) throw new Error('As senhas não coincidem.');
            await api('/activate', 'POST', { token: activationToken, password: v.password });
            onActivated();
            return;
          }
          const r = await api<{ user: Me; csrf: string }>('/login', 'POST', { email: v.email, password: v.password });
          await onLogin(r.user, r.csrf);
        }}>
          {!activating && <label>E-mail<input type="email" name="email" autoComplete="username" required maxLength={254} /></label>}
          <label>{activating ? 'Nova senha' : 'Senha'}
            <input type="password" name="password" autoComplete={activating ? 'new-password' : 'current-password'} required minLength={activating ? 14 : 1} maxLength={128} />
          </label>
          {activating && <label>Confirme a senha<input type="password" name="confirm" autoComplete="new-password" required minLength={14} maxLength={128} /></label>}
          <button className="primary" type="submit">{activating ? 'Ativar acesso' : 'Entrar'}</button>
        </AsyncForm>
        <p className="muted">{activating ? 'O link de ativação é pessoal e tem validade de 24 horas.' : 'Para recuperar o acesso, solicite um novo link ao administrador jurídico.'}</p>
      </section>
    </div>
  );
}
