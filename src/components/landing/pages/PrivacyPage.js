'use client'
import { Mail, Phone, MapPin, UserRound } from 'lucide-react'
import LegalDocLayout from './LegalDocLayout'

// ─── Content — verbatim from "GoFast Delivery Privacy Policy.docx" ──────────────
// Do not rephrase or add sections here without an updated source document.
const SECTIONS = [
  {
    id: 'purpose',
    num: '01',
    title: 'Purpose',
    body: [
      { type: 'p', text: 'Go Fast Delivery Inc. ("Go Fast Delivery", "we", "our", or "us") is committed to protecting the privacy of our customers, recipients, business partners, and website and mobile application users.' },
      { type: 'p', text: 'This Privacy Policy explains how we collect, use, disclose, store, and protect personal information when providing courier and delivery services.' },
      { type: 'p', strong: true, text: "This Policy is intended to comply with Alberta's Personal Information Protection Act (PIPA), applicable provisions of Canada's Personal Information Protection and Electronic Documents Act (PIPEDA), and other applicable Canadian privacy laws." },
      { type: 'p', text: 'By using our services, website, or mobile application, you consent to the collection, use, and disclosure of your personal information as described in this Privacy Policy.' },
    ],
  },
  {
    id: 'information-we-collect',
    num: '02',
    title: 'Personal Information We Collect',
    body: [
      { type: 'p', text: 'We collect only the personal information reasonably necessary to provide our courier services.' },
      { type: 'p', text: 'Depending on the services you use, we may collect:' },
      {
        type: 'ul',
        items: [
          'Full name',
          'Business name (where applicable)',
          'Pickup and delivery addresses',
          'Billing address',
          'Telephone number',
          'Email address',
          'Delivery instructions',
          'Parcel details necessary for delivery',
          'Payment information (processed securely through authorized payment providers)',
          'Proof of delivery, including recipient name, signature, or photograph where applicable',
          'Customer service communications',
          'GPS or location information when using our mobile application (where permitted)',
          'Device information such as IP address, browser type, operating system, and website usage information.',
        ],
      },
      { type: 'p', text: 'We do not intentionally collect more personal information than is reasonably required to provide our services.' },
    ],
  },
  {
    id: 'how-we-collect',
    num: '03',
    title: 'How We Collect Information',
    body: [
      { type: 'p', text: 'We collect personal information:' },
      {
        type: 'ul',
        items: [
          'directly from customers when booking deliveries;',
          'through our website or mobile application;',
          'by telephone, email, or customer support;',
          'from business customers and authorized representatives;',
          'from recipients during delivery;',
          'from payment processors; and',
          'automatically through our website using cookies and similar technologies.',
        ],
      },
    ],
  },
  {
    id: 'how-we-use-information',
    num: '04',
    title: 'How We Use Personal Information',
    body: [
      { type: 'p', text: 'We use personal information to:' },
      {
        type: 'ul',
        items: [
          'schedule pickups and deliveries;',
          'transport parcels from senders to recipients;',
          'verify customer identity;',
          'communicate regarding deliveries;',
          'provide delivery updates and notifications;',
          'process payments;',
          'provide customer support;',
          'investigate lost or damaged shipments;',
          'prevent fraud and unauthorized activity;',
          'improve our services and technology;',
          'maintain business records;',
          'comply with legal and regulatory requirements.',
        ],
      },
      { type: 'p', text: 'We use personal information only for purposes that a reasonable person would consider appropriate in the circumstances.' },
    ],
  },
  {
    id: 'sharing-information',
    num: '05',
    title: 'Sharing Personal Information',
    body: [
      { type: 'p', text: 'We do not sell personal information.' },
      { type: 'p', text: 'We may disclose personal information only where necessary:' },
      {
        type: 'ul',
        items: [
          'to our employees and drivers who require the information to perform delivery services;',
          'to payment processors;',
          'to technology and cloud service providers who support our operations;',
          'to legal, accounting, or professional advisors;',
          'where required by law, court order, or regulatory authority;',
          'to law enforcement where legally authorized; or',
          'as part of a merger, acquisition, or sale of all or part of our business.',
        ],
      },
      { type: 'p', text: 'All third-party service providers are expected to protect personal information using appropriate safeguards.' },
    ],
  },
  {
    id: 'data-retention',
    num: '06',
    title: 'Data Retention',
    body: [
      { type: 'p', text: 'We retain personal information only for as long as necessary to:' },
      {
        type: 'ul',
        items: [
          'complete deliveries;',
          'maintain business and accounting records;',
          'resolve disputes;',
          'comply with legal and regulatory obligations.',
        ],
      },
      { type: 'p', text: 'When personal information is no longer required, it is securely deleted, destroyed, or anonymized.' },
    ],
  },
  {
    id: 'security',
    num: '07',
    title: 'Security',
    body: [
      { type: 'p', text: 'GoFast Delivery maintains reasonable administrative, physical, and technical safeguards to protect personal information against unauthorized access, collection, disclosure, copying, modification, loss, misuse, or destruction.' },
      { type: 'p', text: 'These safeguards include:' },
      {
        type: 'ul',
        items: [
          'secure servers;',
          'encryption where appropriate;',
          'password-protected systems;',
          'restricted employee access;',
          'secure payment processing; and',
          'regular security monitoring.',
        ],
      },
      { type: 'p', text: 'Although we take reasonable steps to protect personal information, no method of electronic transmission or storage can be guaranteed to be completely secure.' },
    ],
  },
  {
    id: 'cookies-analytics',
    num: '08',
    title: 'Cookies and Website Analytics',
    body: [
      { type: 'p', text: 'Our website may use cookies and similar technologies to:' },
      {
        type: 'ul',
        items: [
          'operate the website;',
          'remember user preferences;',
          'improve website performance;',
          'understand website usage; and',
          'generate anonymous statistical reports.',
        ],
      },
      { type: 'p', text: 'You may disable cookies through your browser settings; however, some website features may not function properly.' },
      { type: 'p', text: 'Where required, we will obtain appropriate consent before using non-essential cookies.' },
    ],
  },
  {
    id: 'marketing-communications',
    num: '09',
    title: 'Marketing Communications',
    body: [
      { type: 'p', text: 'If you choose to receive promotional emails or other marketing communications, we may use your contact information to provide updates about our services.' },
      { type: 'p', text: 'You may unsubscribe at any time by using the unsubscribe link included in our communications or by contacting us directly.' },
      { type: 'p', text: "We comply with Canada's Anti-Spam Legislation (CASL)." },
    ],
  },
  {
    id: 'access-and-correction',
    num: '10',
    title: 'Access and Correction',
    body: [
      { type: 'p', text: 'Subject to applicable law, you may request:' },
      {
        type: 'ul',
        items: [
          'access to your personal information;',
          'correction of inaccurate or incomplete information;',
          'information about how your personal information has been used or disclosed; and',
          'withdrawal of consent where legally permitted.',
        ],
      },
      { type: 'p', text: 'Requests should be submitted to our Privacy Officer.' },
      { type: 'p', text: 'We may require reasonable verification of identity before responding to requests.' },
    ],
  },
  {
    id: 'cross-border-service-providers',
    num: '11',
    title: 'Cross-Border Service Providers',
    body: [
      { type: 'p', text: 'Some of our technology or cloud service providers may store or process information outside Alberta or Canada.' },
      { type: 'p', text: 'Where this occurs, personal information may be subject to the laws of the jurisdiction in which it is processed.' },
      { type: 'p', text: 'GoFast Delivery remains responsible for ensuring that service providers protect personal information through appropriate contractual and security safeguards.' },
    ],
  },
  {
    id: 'childrens-privacy',
    num: '12',
    title: "Children's Privacy",
    body: [
      { type: 'p', text: 'Our courier services are intended for individuals who are legally able to enter into contracts.' },
      { type: 'p', text: 'We do not knowingly collect personal information from children without appropriate authorization from a parent or legal guardian.' },
    ],
  },
  {
    id: 'changes-to-this-policy',
    num: '13',
    title: 'Changes to this Privacy Policy',
    body: [
      { type: 'p', text: 'We may update this Privacy Policy from time to time to reflect changes in our services, legal obligations, or business practices.' },
      { type: 'p', text: 'The updated version will be posted on our website together with the revised effective date.' },
      { type: 'p', text: 'Continued use of our services after changes become effective constitutes acceptance of the updated Privacy Policy.' },
    ],
  },
  {
    id: 'contact-us',
    num: '14',
    title: 'Contact Us',
    body: [
      { type: 'p', text: 'If you have questions about this Privacy Policy or wish to exercise your privacy rights, please contact:' },
    ],
  },
]

// Document metadata last-modified date (docProps/core.xml, dcterms:modified) —
// the real revision date of the source .docx, not a placeholder.
const LAST_UPDATED = 'July 17, 2026'

const CONTACT_ROWS = [
  { icon: UserRound, label: 'Privacy Officer', value: 'Mr. Melchior Cyusa' },
  { icon: MapPin, label: 'Address', value: '9–9510 Bonaventure Drive SE, Calgary, Alberta T2J 0E5' },
  { icon: Phone, label: 'Phone', value: '(403) 890-5621', href: 'tel:+14038905621' },
  { icon: Mail, label: 'Email', value: 'info@gfdelivery.ca', href: 'mailto:info@gfdelivery.ca' },
]

function ContactCard() {
  return (
    <div className="pl-0 sm:pl-[2.05rem] mt-1">
      <div
        className="rounded-2xl p-5 sm:p-6"
        style={{ background: 'var(--brand-green-dim)', border: '1px solid rgba(27,185,8,0.25)' }}
      >
        <p className="text-xs font-black" style={{ color: 'var(--landing-text)' }}>Go Fast Delivery Inc.</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          {CONTACT_ROWS.map(({ icon: Icon, label, value, href }) => {
            const content = (
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#ffffff', border: '1px solid rgba(27,185,8,0.25)' }}
                >
                  <Icon size={14} strokeWidth={2.2} style={{ color: 'var(--brand-green)' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black tracking-widest uppercase" style={{ color: 'rgba(0,0,0,0.4)' }}>{label}</p>
                  <p className="text-sm font-semibold leading-snug" style={{ color: 'var(--landing-text)' }}>{value}</p>
                </div>
              </div>
            )
            return href ? (
              <a key={label} href={href} className="hover:opacity-80 transition-opacity">{content}</a>
            ) : (
              <div key={label}>{content}</div>
            )
          })}
        </div>
      </div>
      <p className="text-sm leading-[1.75] font-semibold mt-6" style={{ color: 'var(--landing-text)' }}>
        Go Fast Delivery Inc. is committed to protecting your privacy and handling your personal information
        responsibly, transparently, and in accordance with applicable Canadian privacy legislation.
      </p>
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <LegalDocLayout
      eyebrow="Legal"
      breadcrumbLabel="Privacy Policy"
      headingParts={[
        { text: 'Privacy ', color: 'black' },
        { text: 'Policy', color: 'green', highlight: true },
      ]}
      intro="This Privacy Policy explains how Go Fast Delivery Inc. collects, uses, discloses, and protects your personal information when you use our courier and delivery services."
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
      afterSections={<ContactCard />}
    />
  )
}
