import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * TELEGRAM SCHOOL CLUBS — Retro-Punk Minimal WebApp (single-file React)
 * --------------------------------------------------------------
 * ⚙️ How it works (no external backend required):
 * - Runs inside Telegram WebApp. On enroll/admin-save it calls Telegram.WebApp.sendData(JSON)
 *   so your bot receives `web_app_data` instantly and can forward it to you (see bot code in chat).
 * - Optionally, set API_BASE_URL below to also POST to your server.
 * - Admin mode auto-enables when Telegram user id ∈ ADMIN_IDS.
 *
 * 🎨 Design
 * - Absolute black (#000) background, retro 90s web accent, clean grid, monospace.
 * - Minimal, tap targets large for mobile.
 *
 * 🧪 Local dev (outside Telegram):
 * - We polyfill a fake Telegram user so you can preview in a browser.
 */

// === CONFIG ===
const ADMIN_IDS: string[] = ["123456789"]; // ← ЗАМЕНИ на свой ID БЕЗ @, в кавычках // ← put your Telegram numeric user IDs here
const API_BASE_URL: string | null = null; // e.g. "https://your-domain.com" (optional)

// Sample seed data (admins can edit in-app)
const SEED_CLUBS = [
  {
    id: "robotics",
    title: "Робототехника",
    short: "Собираем и программируем роботов.",
    description:
      "LEGO/Arduino, алгоритмы, участие в соревнованиях. Уровни: новички и продвинутые.",
    schedule: "Пн/Ср 16:00–18:00",
    room: "Каб. 304",
    teacher: "Иван Петров",
    tags: ["техника", "программирование", "соревнования"],
  },
  {
    id: "theatre",
    title: "Театральная студия",
    short: "Импровизация, сцена, голос.",
    description:
      "Работа с текстом, пластикой и речью. Готовим школьные постановки и скетчи.",
    schedule: "Вт/Чт 17:00–19:00",
    room: "Актовый зал",
    teacher: "Анна Соколова",
    tags: ["сцена", "творчество"],
  },
  {
    id: "mathcircle",
    title: "Математический кружок",
    short: "Олимпиадная математика и логика.",
    description:
      "Разбираем нестандартные задачи, готовимся к олимпиадам. Разные параллели классов.",
    schedule: "Сб 12:00–14:00",
    room: "Каб. 210",
    teacher: "Мария Ким",
    tags: ["олимпиады", "логика"],
  },
];

// === Tiny Telegram hook with safe polyfill for local dev ===
const useTelegram = () => {
  const [tg, setTg] = useState<any>(null);
  useEffect(() => {
    // Polyfill for local preview
    if (!(window as any).Telegram) {
      (window as any).Telegram = {
        WebApp: {
          initData: "",
          initDataUnsafe: {
            user: {
              id: 111222333,
              username: "local_dev",
              first_name: "Local",
              last_name: "Dev",
              language_code: "ru",
            },
          },
          ready: () => {},
          expand: () => {},
          sendData: (data: string) => {
            console.log("[WebApp.sendData]", data);
            alert("(Local preview) Данные отправлены в консоль. См. DevTools → Console.");
          },
          showPopup: ({ title, message }: any) => alert(`${title}\n\n${message}`),
          showConfirm: ({ message }: any) => Promise.resolve(window.confirm(message)),
          setHeaderColor: () => {},
          setBackgroundColor: () => {},
          colorScheme: "dark",
          themeParams: {},
          viewportHeight: window.innerHeight,
        },
      };
    }
    const wtg = (window as any).Telegram?.WebApp || null;
    setTg(wtg);
    try {
      wtg?.ready();
      wtg?.expand?.();
      wtg?.setHeaderColor?.("#000000");
      wtg?.setBackgroundColor?.("#000000");
    } catch {}
  }, []);

  const user = tg?.initDataUnsafe?.user || null;
  return { tg, user };
};

// === Helpers ===
const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");
const nowIso = () => new Date().toISOString();
const toTel = (v: string) => v.replace(/[^+\d]/g, "");

// Local storage persistence for clubs (simple)
const CLUBS_KEY = "school.clubs.v1";
function loadClubs(): any[] {
  try {
    const raw = localStorage.getItem(CLUBS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return SEED_CLUBS;
}
function saveClubs(clubs: any[]) {
  try {
    localStorage.setItem(CLUBS_KEY, JSON.stringify(clubs));
  } catch {}
}

// === UI atoms ===
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] uppercase tracking-wider text-zinc-300">
      {children}
    </span>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 border-b border-zinc-800 pb-2 font-mono text-xs uppercase tracking-widest text-zinc-400">
      {children}
    </h2>
  );
}

// === Enrollment form ===
function EnrollForm({
  club,
  user,
  onCancel,
  onDone,
}: {
  club: any;
  user: any;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { tg } = useTelegram();
  const [form, setForm] = useState({
    firstName: user?.first_name ?? "",
    lastName: user?.last_name ?? "",
    grade: "",
    phone: "",
    email: "",
    telegram: user?.username ? `@${user.username}` : "",
  });
  const [busy, setBusy] = useState(false);

  const invalid = useMemo(() => {
    if (!form.firstName || !form.lastName) return true;
    if (!/^[0-9А-Яа-яA-Za-z\-\s]{1,20}$/.test(form.grade || "")) return true;
    if (!/^\+?\d{7,15}$/.test(toTel(form.phone || ""))) return true;
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return true;
    return false;
  }, [form]);

  async function submit() {
    if (invalid || busy) return;
    setBusy(true);
    const payload = {
      type: "enroll",
      club: { id: club.id, title: club.title },
      submitted_at: nowIso(),
      form: {
        ...form,
        phone: toTel(form.phone),
      },
      telegram_user: user
        ? {
            id: user.id,
            username: user.username || null,
            first_name: user.first_name,
            last_name: user.last_name || null,
            language_code: user.language_code || null,
          }
        : null,
    } as const;

    try {
      // 1) Send to Telegram bot immediately
      tg?.sendData && tg.sendData(JSON.stringify(payload));

      // 2) Optional: POST to your backend
      if (API_BASE_URL) {
        await fetch(`${API_BASE_URL}/api/enroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      tg?.showPopup?.({ title: "Отправлено", message: "Заявка отправлена. Скоро с вами свяжутся." });
      onDone();
    } catch (e) {
      console.error(e);
      tg?.showPopup?.({ title: "Ошибка", message: "Не удалось отправить. Попробуйте ещё раз." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-black p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">
            Заявка в кружок
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-zinc-900"
          >
            × Закрыть
          </button>
        </div>
        <div className="mb-4 font-mono text-sm text-zinc-200">
          <div className="text-zinc-500">Кружок</div>
          <div className="text-base text-zinc-50">{club.title}</div>
        </div>
        <div className="space-y-3">
          <Inp label="Имя" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} />
          <Inp label="Фамилия" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} />
          <Inp label="Класс" placeholder="например: 7Б" value={form.grade} onChange={(v) => setForm({ ...form, grade: v })} />
          <Inp label="Номер телефона" placeholder="+79991234567" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Inp label="Почта" type="email" placeholder="you@example.com" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Inp label="Телеграм" placeholder="@username" value={form.telegram} onChange={(v) => setForm({ ...form, telegram: v })} />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            disabled={invalid || busy}
            onClick={submit}
            className={cx(
              "flex-1 rounded-xl border px-4 py-3 font-mono text-sm uppercase tracking-widest",
              invalid || busy
                ? "border-zinc-800 bg-zinc-900 text-zinc-600"
                : "border-lime-400/40 bg-black text-lime-300 hover:bg-lime-950/20"
            )}
          >
            {busy ? "Отправка…" : "Отправить"}
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-zinc-800 px-4 py-3 font-mono text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function Inp({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const id = useRef(Math.random().toString(36).slice(2));
  return (
    <label className="block">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-zinc-400">{label}</div>
      <input
        id={id.current}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
      />
    </label>
  );
}

// === Admin editor ===
function AdminPanel({ clubs, setClubs, notify }: { clubs: any[]; setClubs: (c: any[]) => void; notify: (payload: any) => Promise<void> }) {
  const [draft, setDraft] = useState<any | null>(null);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(
    () =>
      clubs.filter(
        (c) =>
          c.title.toLowerCase().includes(filter.toLowerCase()) ||
          c.tags?.some((t: string) => t.toLowerCase().includes(filter.toLowerCase()))
      ),
    [clubs, filter]
  );

  function newClub() {
    setDraft({
      id: Math.random().toString(36).slice(2),
      title: "Новый кружок",
      short: "Короткое описание",
      description: "Подробное описание кружка",
      schedule: "",
      room: "",
      teacher: "",
      tags: [],
    });
  }

  function saveClub() {
    if (!draft) return;
    const exists = clubs.some((c) => c.id === draft.id);
    const next = exists ? clubs.map((c) => (c.id === draft.id ? draft : c)) : [...clubs, draft];
    setClubs(next);
    saveClubs(next);
  }

  function deleteClub(id: string) {
    const next = clubs.filter((c) => c.id !== id);
    setClubs(next);
    saveClubs(next);
  }

  async function sendAll() {
    await notify({ type: "admin_update", submitted_at: nowIso(), clubs });
  }

  return (
    <div className="mt-6 rounded-2xl border border-zinc-800 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">Режим админа</div>
        <div className="flex gap-2">
          <button onClick={newClub} className="rounded-lg border border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-200 hover:bg-zinc-900">
            + Добавить кружок
          </button>
          <button onClick={sendAll} className="rounded-lg border border-lime-400/40 px-3 py-2 font-mono text-xs text-lime-300 hover:bg-lime-950/20">
            Отправить список мне
          </button>
        </div>
      </div>

      <div className="mb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Поиск по названию/тегам"
          className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-xl border border-zinc-800 p-3">
            <div className="mb-1 font-mono text-sm text-zinc-100">{c.title}</div>
            <div className="mb-2 font-mono text-xs text-zinc-400">{c.short}</div>
            <div className="flex gap-2">
              <button
                onClick={() => setDraft({ ...c })}
                className="rounded-lg border border-zinc-800 px-3 py-1.5 font-mono text-[11px] text-zinc-200 hover:bg-zinc-900"
              >
                ✎ Редактировать
              </button>
              <button
                onClick={() => deleteClub(c.id)}
                className="rounded-lg border border-rose-500/40 px-3 py-1.5 font-mono text-[11px] text-rose-300 hover:bg-rose-950/20"
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-black p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-xs uppercase tracking-widest text-zinc-400">Редактор кружка</div>
              <button onClick={() => setDraft(null)} className="rounded-lg border border-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-zinc-900">
                × Закрыть
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Inp label="ID (латиница)" value={draft.id} onChange={(v) => setDraft({ ...draft, id: v })} />
              <Inp label="Название" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
              <div className="sm:col-span-2">
                <Inp label="Коротко" value={draft.short} onChange={(v) => setDraft({ ...draft, short: v })} />
              </div>
              <div className="sm:col-span-2">
                <label className="block">
                  <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-zinc-400">Описание</div>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="h-32 w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
                  />
                </label>
              </div>
              <Inp label="Расписание" value={draft.schedule} onChange={(v) => setDraft({ ...draft, schedule: v })} />
              <Inp label="Кабинет/место" value={draft.room} onChange={(v) => setDraft({ ...draft, room: v })} />
              <Inp label="Педагог" value={draft.teacher} onChange={(v) => setDraft({ ...draft, teacher: v })} />
              <Inp label="Теги (через запятую)" value={(draft.tags || []).join(", ")} onChange={(v) => setDraft({ ...draft, tags: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={saveClub} className="rounded-xl border border-lime-400/40 px-4 py-3 font-mono text-sm text-lime-300 hover:bg-lime-950/20">
                Сохранить
              </button>
              <button onClick={() => setDraft(null)} className="rounded-xl border border-zinc-800 px-4 py-3 font-mono text-sm text-zinc-300 hover:bg-zinc-900">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Club card ===
function ClubCard({ club, onOpen, onEnroll }: { club: any; onOpen: () => void; onEnroll: () => void }) {
  return (
    <div className="group rounded-2xl border border-zinc-800 bg-black p-4 hover:border-lime-500/40">
      <div className="mb-1 font-mono text-sm text-zinc-100">{club.title}</div>
      <div className="mb-3 font-mono text-xs text-zinc-400">{club.short}</div>
      <div className="mb-3 flex flex-wrap gap-1">
        {(club.tags || []).slice(0, 4).map((t: string) => (
          <Pill key={t}>{t}</Pill>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onOpen} className="rounded-xl border border-zinc-800 px-3 py-2 font-mono text-[11px] text-zinc-200 hover:bg-zinc-900">
          Подробнее
        </button>
        <button onClick={onEnroll} className="rounded-xl border border-lime-400/40 px-3 py-2 font-mono text-[11px] text-lime-300 hover:bg-lime-950/20">
          Записаться
        </button>
      </div>
    </div>
  );
}

// === Main App ===
export default function App() {
  const { tg, user } = useTelegram();
  const [clubs, setClubs] = useState<any[]>(loadClubs());
  const [query, setQuery] = useState("");
  const [openClub, setOpenClub] = useState<any | null>(null);
  const [enrollClub, setEnrollClub] = useState<any | null>(null);

  const isAdmin = useMemo(() => (user ? ADMIN_IDS.includes(String(user.id)) : false), [user]);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.body.className = "bg-black";
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter((c) => {
      return (
        c.title.toLowerCase().includes(q) ||
        c.short.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.tags || []).some((t: string) => t.toLowerCase().includes(q))
      );
    });
  }, [query, clubs]);

  async function notify(payload: any) {
    try {
      tg?.sendData && tg.sendData(JSON.stringify(payload));
      if (API_BASE_URL) {
        await fetch(`${API_BASE_URL}/api/admin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      tg?.showPopup?.({ title: "Готово", message: "Информация отправлена." });
    } catch (e) {
      console.error(e);
      tg?.showPopup?.({ title: "Ошибка", message: "Не удалось отправить." });
    }
  }

  return (
    <div className="min-h-screen bg-black px-4 pb-16">
      {/* Header */}
      <header className=\"sticky top-0 z-20 -mx-4 mb-4 border-b border-zinc-900 bg-black/85 px-4 py-3 backdrop-blur\">
        {!user && (
          <div className=\"mb-2 rounded-lg border border-amber-500/40 bg-amber-950/20 p-2 text-center font-mono text-[11px] text-amber-300\">
            Откройте приложение через кнопку в Telegram-боте, иначе админ-режим не сработает.
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 text-zinc-300">★</div>
            <div>
              <div className="font-mono text-sm text-zinc-100">School Clubs</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">retro//punk minimal</div>
            </div>
          </div>
          {user && (
            <div className="text-right">
              <div className="font-mono text-xs text-zinc-300">{user.first_name} {user.last_name || ""}</div>
              <div className="font-mono text-[10px] text-zinc-500">{user.username ? `@${user.username}` : `id:${user.id}`}</div>
            </div>
          )}
        </div>
        <div className="mt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск кружков…"
            className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-lime-500/50"
          />
        </div>
      </header>

      {/* List */}
      <main className="mx-auto max-w-3xl">
        {filtered.length === 0 ? (
          <div className="mt-16 text-center font-mono text-sm text-zinc-500">Ничего не найдено</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((c) => (
              <ClubCard
                key={c.id}
                club={c}
                onOpen={() => setOpenClub(c)}
                onEnroll={() => setEnrollClub(c)}
              />
            ))}
          </div>
        )}

        {/* Admin */}
        {isAdmin && (
          <AdminPanel
            clubs={clubs}
            setClubs={(next) => {
              setClubs(next);
              saveClubs(next);
            }}
            notify={notify}
          />
        )}
      </main>

      {/* Club modal */}
      {openClub && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-black p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-mono text-sm text-zinc-100">{openClub.title}</div>
              <button onClick={() => setOpenClub(null)} className="rounded-lg border border-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-zinc-900">
                × Закрыть
              </button>
            </div>
            <div className="font-mono text-sm text-zinc-300">{openClub.description}</div>
            <div className="mt-3 grid gap-2 font-mono text-xs text-zinc-400">
              <div>⏰ Расписание: <span className="text-zinc-200">{openClub.schedule || "уточняется"}</span></div>
              <div>📍 Место: <span className="text-zinc-200">{openClub.room || "уточняется"}</span></div>
              <div>👤 Педагог: <span className="text-zinc-200">{openClub.teacher || "—"}</span></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setEnrollClub(openClub)} className="rounded-xl border border-lime-400/40 px-4 py-3 font-mono text-sm text-lime-300 hover:bg-lime-950/20">
                Записаться
              </button>
              <button onClick={() => setOpenClub(null)} className="rounded-xl border border-zinc-800 px-4 py-3 font-mono text-sm text-zinc-300 hover:bg-zinc-900">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll modal */}
      {enrollClub && (
        <EnrollForm club={enrollClub} user={user} onCancel={() => setEnrollClub(null)} onDone={() => setEnrollClub(null)} />)
      }

      {/* Footer */}
      <footer className="mx-auto mt-10 max-w-3xl pb-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-700">
          © {new Date().getFullYear()} school clubs · black // retro // minimal
        </div>
      </footer>
    </div>
  );
}
