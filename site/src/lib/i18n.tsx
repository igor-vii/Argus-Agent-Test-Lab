"use client";

/**
 * Argus landing i18n — EN canonical, RU mirror.
 * Registry + cases stay EN by design (sealed facts are quoted in EN everywhere);
 * only navigation, hero, method and engage copy are localized.
 * For production deploy: split into / and /ru with hreflang (see sitemap plan).
 */

import { createContext, useContext, useSyncExternalStore, useEffect, type ReactNode } from "react";

export type Lang = "en" | "ru";

const en = {
  nav: { registry: "Registry", method: "Method", cases: "Cases", engage: "Engage" },
  hero: {
    kicker: "adversarial testing lab · agentic payment rails",
    titleA: "We sign our findings,",
    titleB: "not our opinions.",
    text: "Argus Agent Test Lab runs black-box adversarial batteries against the SDKs and platforms that move agentic money — x402 payment flows, credit and settlement handling, idempotency guarantees. Every verdict is a sealed record in a public hash chain that anyone can verify in one command.",
    ctaPrimary: "Explore the registry",
    ctaSecondary: "Commission a round",
    stats: [
      { v: "sealed records, hash-chained" },
      { v: "systems under test" },
      { v: "pre-registered probes" },
      { v: "findings retracted" },
    ],
  },
  registry: {
    kicker: "the registry",
    title: "A chain of seals, not a list of claims",
    text: "Each node is an Ed25519-signed record chained to the hash of its predecessor: finding or battery, verdicts, findings, hash-pinned evidence. Select a seal to inspect it.",
  },
  method: {
    kicker: "method",
    title: "Four rules that make a verdict worth something",
    text: "The lab's credibility is structural: it comes from what a probe must go through before anyone is allowed to call it a failure.",
    cards: [
      {
        title: "Black-box by construction",
        text: "The SUT is always the published artifact — npm dist, exact pin, unmodified. No source access, no vendor cooperation required. If it can't be shown against the artifact users actually install, it isn't shown.",
      },
      {
        title: "Pre-registered before the run",
        text: "Required behaviors and verdict rules are fixed in committed matrix files before a single probe fires. No post-hoc reshaping of what a failure means — the rig can't drift toward the conclusion.",
      },
      {
        title: "Offline by default",
        text: "All traffic on 127.0.0.1 against adversarial stands and honest mock backends modeled from the vendor's own contracts, each decision citing a vendor source line. No vendor-operated service is touched without written authorization.",
      },
      {
        title: "Sealed and hash-chained",
        text: "Every record is signed with Ed25519 and chained to the previous record's hash. Anyone can verify the whole chain from the public repo in one command. Seals attest run validity and findings completeness — not bug-freeness.",
      },
    ],
    taxonomyTitle: "verdict taxonomy",
    taxonomy: [
      { text: "Vendor-side failure under the probe — the SDK or platform loses money or integrity under the tested fault." },
      { text: "The SDK rejected or limited the fault — a genuine guard fired where the battery expected one." },
      { text: "The platform held beyond the documented scenarios." },
      { text: "Observed behavior matches the vendor's published disclosure — an honest-posture result, not a defect." },
      { text: "Developer-experience finding: no direct money-loss path, but the tooling hides a hazard the runtime itself flags." },
    ],
  },
  cases: {
    kicker: "cases",
    title: "Every verdict, public and linked",
    text: "Six fronts so far — from an upstream reference client to payment SDKs carrying real money. Each card links back to sealed records and public threads; nothing on this page exists outside the registry.",
  },
  engage: {
    kicker: "engage",
    title: "Run your code before your users do",
    text: "Two working tracks, both ending in the same artifact: a sealed verdict anyone can verify. Engagements begin with written scope; nothing about an engagement changes a verdict.",
    tracks: [
      {
        title: "Coordinated production round",
        text: "You invited reproduction against production; we run it under written scope authorization: funded test wallet, agreed time window on 48 hours' notice, a no-debit/refund arrangement for probe transactions, full request capture shared with you. Deliverable: a sealed production-round report — either clearing the production endpoint, or documenting the exact boundary where defects become live money movement.",
        meta: "from $990 / round",
      },
      {
        title: "Fix verification",
        text: "Our batteries become your acceptance rig. You ship a patched artifact; we re-run the sealed suite against the published release and seal PASS/FAIL per finding. A clean seal is an independently checkable artifact you can cite to integrators and in your security narrative.",
        meta: "Per-finding sealed verdict",
      },
    ],
    termsTitle: "terms of engagement",
    terms: [
      "Fixed per-round fee or a short retainer, agreed before any run.",
      "Reports and seals remain the lab's to publish; vendor responses get equal space.",
      "Production rounds require written scope, a funded test wallet, and a no-debit arrangement.",
      "Private resolution is welcome — the seal is not a weapon, it is a receipt.",
    ],
    ctaGitHub: "Start via GitHub",
    ctaOnePager: "One-pager (PDF)",
    contactNote: "github.com/igor-vii/Argus-Agent-Test-Lab · issues open",
    principles: [
      "Praise in public where it is earned — as loudly as failures get stated.",
      "Break in public where it is broken — with line numbers, not adjectives.",
      "Vendor responses get equal space alongside every published finding.",
      "No vendor operates our stands; no engagement buys a verdict.",
    ],
  },
  footer: {
    tagline: "Independent adversarial testing for agentic payment rails. No vendor operates our stands.",
    chainHead: "chain head",
    records: "records",
  },
};

export type Dict = typeof en;

const ru: Dict = {
  nav: { registry: "Реестр", method: "Метод", cases: "Кейсы", engage: "Заказать" },
  hero: {
    kicker: "адверсариальная лаборатория · платёжные рельсы для агентов",
    titleA: "Мы подписываем находки,",
    titleB: "а не мнения.",
    text: "Argus Agent Test Lab гоняет чёрно-ящичные адверсариальные батареи по SDK и платформам, которые двигают агентские деньги — платёжные потоки x402, обработку кредитов и расчётов, гарантии идемпотентности. Каждый вердикт — запечатанная запись в публичной hash-цепи, которую любой может проверить одной командой.",
    ctaPrimary: "Открыть реестр",
    ctaSecondary: "Заказать раунд",
    stats: [
      { v: "запечатанных записей в цепи" },
      { v: "систем под испытанием" },
      { v: "предрегистрированных проб" },
      { v: "отозванных находок" },
    ],
  },
  registry: {
    kicker: "реестр",
    title: "Цепь печатей, а не список заявлений",
    text: "Каждый узел — запись, подписанная Ed25519 и прикованная к хешу предыдущей: находка или батарея, вердикты, findings, хеш-закреплённые доказательства. Выберите печать, чтобы осмотреть её.",
  },
  method: {
    kicker: "метод",
    title: "Четыре правила, из-за которых вердикт чего-то стоит",
    text: "Доверие лаборатории — структурное: оно складывается из того, что проба обязана пройти, прежде чем кто-либо вправе назвать это провалом.",
    cards: [
      {
        title: "Чёрный ящик по построению",
        text: "СУТ — всегда опубликованный артефакт: npm dist, точный пин, без модификаций. Ни доступа к исходникам, ни сотрудничества вендора. Если это не показано на артефакте, который ставят пользователи, — этого не показано.",
      },
      {
        title: "Предрегистрация до прогона",
        text: "Требуемые поведения и правила вердикта фиксируются в коммитнутых матрицах до первого выстрела пробы. Никакой перекройки смысла провала задним числом — стенд не может дрейфовать к выводу.",
      },
      {
        title: "Офлайн по умолчанию",
        text: "Весь трафик — на 127.0.0.1, против адверсариальных стендов и честных моков, смоделированных из контрактов самого вендора, где каждое решение ссылается на строку его кода. Ни один вендорский сервис не трогается без письменной авторизации.",
      },
      {
        title: "Печать и hash-цепь",
        text: "Каждая запись подписана Ed25519 и прикована к хешу предыдущей. Любой проверяет всю цепь из публичного репозитория одной командой. Печать удостоверяет валидность прогона и полноту находок — а не безбажность.",
      },
    ],
    taxonomyTitle: "таксономия вердиктов",
    taxonomy: [
      { text: "Провал на стороне вендора под пробой — SDK или платформа теряет деньги или целостность на испытанном сбое." },
      { text: "SDK отверг или ограничил сбой — настоящий guard сработал там, где батарея его ожидала." },
      { text: "Платформа держалась за пределами документированных сценариев." },
      { text: "Наблюдаемое поведение совпадает с публичным disclosure вендора — честная поза, а не дефект." },
      { text: "Developer-experience находка: прямого пути потери денег нет, но инструментарий прячет опасность, которую флагует сам рантайм." },
    ],
  },
  cases: {
    kicker: "кейсы",
    title: "Каждый вердикт публичен и имеет ссылку",
    text: "Шесть фронтов — от upstream reference-клиента до платёжных SDK, несущих настоящие деньги. Каждая карточка ссылается на запечатанные записи и публичные треды; ничто на этой странице не существует вне реестра.",
  },
  engage: {
    kicker: "заказать",
    title: "Проверьте свой код раньше пользователей",
    text: "Два рабочих трека, оба заканчиваются одним артефактом: запечатанным вердиктом, который можно проверить. Работа начинается с письменного скоупа; ничто в рамках заказа не меняет вердикт.",
    tracks: [
      {
        title: "Координированный production-раунд",
        text: "Вы пригласили воспроизведение на production — мы гоняем его под письменной авторизацией скоупа: финансируемый тестовый кошелёк, согласованное окно с уведомлением за 48 часов, договорённость no-debit/refund для пробных транзакций, полный захват запросов передаётся вам. Результат: запечатанный отчёт production-раунда — либо очистка endpoint'а, либо точная граница, где дефекты становятся живым движением денег.",
        meta: "от $990 / раунд",
      },
      {
        title: "Верификация фикса",
        text: "Наши батареи становятся вашим acceptance-стендом. Вы выпускаете пропатченный артефакт — мы перегоняем запечатанный набор по опубликованному релизу и запечатываем PASS/FAIL по каждой находке. Чистая печать — независимо проверяемый артефакт, который вы можете цитировать интеграторам и в security-нарративе.",
        meta: "запечатанный вердикт по находке",
      },
    ],
    termsTitle: "условия работы",
    terms: [
      "Фиксированная плата за раунд или короткий ретейнер — согласованы до любого прогона.",
      "Отчёты и печати остаются правом публикации лаборатории; ответам вендора выделяется равное место.",
      "Production-раунды требуют письменного скоупа, финансируемого тестового кошелька и договорённости no-debit.",
      "Приватное решение приветствуется — печать не оружие, печать это квитанция.",
    ],
    ctaGitHub: "Начать через GitHub",
    ctaOnePager: "One-pager (PDF)",
    contactNote: "github.com/igor-vii/Argus-Agent-Test-Lab · issues открыты",
    principles: [
      "Хвали публично, где заслужено — так же громко, как констатируются провалы.",
      "Ломай публично, где сломано — с номерами строк, а не прилагательными.",
      "Ответы вендора получают равное место рядом с каждой опубликованной находкой.",
      "Наши стенды не управляются вендорами; заказ не покупает вердикт.",
    ],
  },
  footer: {
    tagline: "Независимое адверсариальное тестирование платёжных рельсов для агентов. Наши стенды не управляются вендорами.",
    chainHead: "голова цепи",
    records: "записей",
  },
};

const DICTS: Record<Lang, Dict> = { en, ru };

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

/* localStorage-backed external store — no setState-in-effect, hydration-safe */
const langStore = (() => {
  const listeners = new Set<() => void>();
  let current: Lang | null = null;
  const read = (): Lang => {
    if (current === null) {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem("argus-lang") : null;
      current = saved === "ru" ? "ru" : "en";
    }
    return current;
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: read,
    getServerSnapshot: () => "en" as Lang,
    set(next: Lang) {
      current = next;
      try {
        window.localStorage.setItem("argus-lang", next);
      } catch {}
      document.documentElement.lang = next;
      listeners.forEach((l) => l());
    },
  };
})();

const LangCtx = createContext<LangState>({ lang: "en", setLang: () => {}, t: en });

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(langStore.subscribe, langStore.getSnapshot, langStore.getServerSnapshot);

  /* keep <html lang> in sync with a restored saved preference (DOM-only, no state writes) */
  useEffect(() => {
    document.documentElement.lang = langStore.getSnapshot();
  }, []);

  return <LangCtx.Provider value={{ lang, setLang: langStore.set, t: DICTS[lang] }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}
