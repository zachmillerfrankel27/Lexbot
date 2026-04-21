import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — Orville',
}

const LAST_UPDATED = 'March 2026'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black text-gray-400 px-6 py-16 flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col gap-10">

        {/* Header */}
        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-[10px] tracking-[0.3em] uppercase text-gray-700 hover:text-gray-500 transition-colors mb-4 self-start"
          >
            ← Back to Orville
          </Link>
          <h1
            className="text-2xl tracking-[0.2em] uppercase text-gray-200 font-light"
            style={{ fontFamily: "'Cinzel', Georgia, serif" }}
          >
            Privacy Policy
          </h1>
          <p className="text-xs text-gray-700 tracking-widest uppercase">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <Section title="Overview">
          Orville is a voice-first AI law tutor by Orbly. We take your privacy seriously. This
          policy explains what data is collected when you use Orville, how it is used,
          and what we do not do with it.
        </Section>

        <Section title="What We Collect">
          <ul className="flex flex-col gap-3 list-none">
            <Item label="Conversation content">
              Your messages and Orville's responses are sent to Anthropic's Claude API
              to generate replies, and to ElevenLabs to produce Orville's voice.
              These third-party services process your input under their own privacy
              policies (linked below). We do not store your conversations on our
              servers.
            </Item>
            <Item label="Conversation history">
              Your chat history is stored locally in your browser using
              localStorage. It never leaves your device unless you are actively
              in a session. You can clear it at any time using the "Clear" button
              in the app.
            </Item>
            <Item label="Access credentials">
              Your invite code is stored as a secure, HTTP-only cookie in your
              browser for up to 90 days so you don't have to re-enter it. It is
              not linked to any personal information.
            </Item>
            <Item label="Usage data">
              We may collect anonymised, aggregate usage data (e.g. number of
              sessions) to understand how the product is used. This data cannot
              be used to identify you.
            </Item>
          </ul>
        </Section>

        <Section title="What We Don't Do">
          <ul className="flex flex-col gap-3 list-none">
            <Item>We do not sell your data to any third party.</Item>
            <Item>We do not use your conversations for advertising.</Item>
            <Item>We do not require you to create an account or provide personal information to use Orville.</Item>
            <Item>We do not share your data with anyone except the third-party processors listed below, solely to operate the service.</Item>
          </ul>
        </Section>

        <Section title="Third-Party Processors">
          The following services process data on our behalf when you use Orville:
          <ul className="flex flex-col gap-3 mt-4 list-none">
            <Item label="Anthropic (Claude AI)">
              Processes your messages to generate responses. Privacy policy:{' '}
              <ExternalLink href="https://www.anthropic.com/privacy">
                anthropic.com/privacy
              </ExternalLink>
            </Item>
            <Item label="ElevenLabs">
              Processes Orville's text responses to generate voice audio. Privacy policy:{' '}
              <ExternalLink href="https://elevenlabs.io/privacy">
                elevenlabs.io/privacy
              </ExternalLink>
            </Item>
            <Item label="Vercel">
              Hosts the application and may log standard server access data
              (IP addresses, timestamps). Privacy policy:{' '}
              <ExternalLink href="https://vercel.com/legal/privacy-policy">
                vercel.com/legal/privacy-policy
              </ExternalLink>
            </Item>
          </ul>
        </Section>

        <Section title="Your Rights">
          Because we do not store personal data on our servers, most data
          subject rights (access, deletion, portability) are satisfied by
          the controls already in your browser. You can:
          <ul className="flex flex-col gap-2 mt-3 list-none">
            <Item>Clear your conversation history using the "Clear" button in the app.</Item>
            <Item>Delete your access cookie by clearing your browser cookies.</Item>
            <Item>Contact us (see below) if you have questions about data held by our processors.</Item>
          </ul>
          If you are located in the European Economic Area, you have the right
          to lodge a complaint with your local supervisory authority.
        </Section>

        <Section title="Children">
          Orville is intended for use by law students. It is
          not directed at children under 13. We do not knowingly collect data
          from children.
        </Section>

        <Section title="Changes to This Policy">
          We may update this policy as the product evolves. We will update the
          "Last updated" date above when we do. Continued use of Orville after
          changes are posted constitutes acceptance of the updated policy.
        </Section>

        <Section title="Contact">
          If you have questions about this policy, please reach out via the
          GitHub repository or through the contact information provided at
          sign-up.
        </Section>

        {/* Footer */}
        <div className="border-t border-gray-900 pt-8">
          <Link
            href="/"
            className="text-xs tracking-widest uppercase text-gray-700 hover:text-gray-500 transition-colors"
          >
            ← Return to Orville
          </Link>
        </div>

      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2
        className="text-xs tracking-[0.3em] uppercase text-gray-500"
        style={{ fontFamily: "'Cinzel', Georgia, serif" }}
      >
        {title}
      </h2>
      <div className="text-sm text-gray-500 leading-relaxed">{children}</div>
    </section>
  )
}

function Item({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-1">
      {label && (
        <span className="text-xs text-gray-400 tracking-widest uppercase">{label}</span>
      )}
      <span className="text-sm text-gray-500 leading-relaxed">{children}</span>
    </li>
  )
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-400 hover:text-gray-200 underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  )
}
