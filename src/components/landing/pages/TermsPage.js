'use client'
import LegalDocLayout from './LegalDocLayout'

// ─── Content — verbatim from GO_FAST_Delivery_Terms_and_Conditions_Revised.docx ──
// Do not rephrase or add sections here without an updated source document.
const SECTIONS = [
  {
    id: 'services',
    num: '01',
    title: 'Services',
    body: [
      { type: 'p', text: "Go Fast Delivery ('Go Fast') provides ground courier and delivery services within Alberta, Canada. All services are subject to these Terms and Conditions." },
    ],
  },
  {
    id: 'liability',
    num: '02',
    title: 'Liability',
    body: [
      { type: 'p', text: "Go Fast exercises reasonable care in transporting shipments. Unless prohibited by law, liability for loss or damage resulting directly from Go Fast's proven negligence is limited to the lesser of the actual proven value of the shipment, the declared value (if accepted by Go Fast), or the transportation charges paid. Go Fast is not liable for indirect, incidental, consequential, punitive, or business losses. Cargo insurance is not provided unless expressly agreed in writing." },
    ],
  },
  {
    id: 'prohibited-goods',
    num: '03',
    title: 'Prohibited Goods',
    body: [
      { type: 'p', text: 'Go Fast will not transport goods prohibited by law, dangerous goods regulated under the Transportation of Dangerous Goods Act, 1992 (Canada) and applicable regulations, firearms, contraband, cash, live animals, precious metals, endangered species products, or other unsafe items. Go Fast may inspect shipments for weight reassessment, for safety, where required by law or where prohibited contents are reasonably suspected.' },
    ],
  },
  {
    id: 'temperature-sensitive-goods',
    num: '04',
    title: 'Temperature-Sensitive Goods',
    body: [
      { type: 'p', text: "Perishable or temperature-sensitive goods are transported at the shipper's risk unless temperature-controlled transportation has been expressly agreed." },
    ],
  },
  {
    id: 'packaging',
    num: '05',
    title: 'Packaging',
    body: [
      { type: 'p', text: 'Shippers are responsible for proper packaging, labelling and accurate weight declarations. Maximum per package weight is 10 kg (22 lb). Improperly packaged shipments may be refused until properly packaged.' },
    ],
  },
  {
    id: 'labels',
    num: '06',
    title: 'Labels',
    body: [
      { type: 'p', text: 'Packages must display complete sender and receiver information, delivery address, contact details, access instructions where applicable, and clear shipment identification. Batch shipments must be properly labelled (for instance 1/10; 2/10; 3/10 etc.).' },
    ],
  },
  {
    id: 'pricing',
    num: '07',
    title: 'Pricing',
    body: [
      { type: 'p', text: 'Rates shown at booking are estimates exclusive of applicable taxes unless stated otherwise. Overweight, waiting time (first 15 minutes free) fee at 20% of the trip cost, redelivery (at original trip cost) and failed pickup charges may apply.' },
    ],
  },
  {
    id: 'accounts-and-billing',
    num: '08',
    title: 'Accounts and Billing',
    body: [
      { type: 'p', text: 'Unless otherwise agreed, weekly invoices are issued to the designated email address. Payment is due upon receipt unless otherwise agreed. Invoice disputes must be submitted within 15 days of receiving the invoice.' },
    ],
  },
  {
    id: 'proof-of-delivery',
    num: '09',
    title: 'Proof of Delivery',
    body: [
      { type: 'p', text: 'Electronic proof (Time stamp) of delivery confirms delivery. Visible damage or delivery issues should be reported within 12 hours.' },
    ],
  },
  {
    id: 'delivery-times',
    num: '10',
    title: 'Delivery Times',
    body: [
      { type: 'p', text: 'Estimated delivery times are not guaranteed and may vary due to weather, traffic, road closures or other operational factors.' },
    ],
  },
  {
    id: 'force-majeure',
    num: '11',
    title: 'Force Majeure',
    body: [
      { type: 'p', text: 'Go Fast is not responsible for delays or failures caused by events beyond its reasonable control, including natural disasters, labor disruptions, government actions, internet outages or similar events.' },
    ],
  },
  {
    id: 'cancellations',
    num: '12',
    title: 'Cancellations',
    body: [
      { type: 'p', text: 'Orders cancelled before driver dispatch receive a full refund. After dispatch, a failed pickup charge (at 50% of the trip cost) apply.' },
    ],
  },
  {
    id: 'intellectual-property',
    num: '13',
    title: 'Intellectual Property',
    body: [
      { type: 'p', text: 'All Go Fast trademarks, logos, website content, electronic systems, and branding remain the property of Go Fast Delivery.' },
    ],
  },
  {
    id: 'governing-law',
    num: '14',
    title: 'Governing Law',
    body: [
      { type: 'p', text: 'These Terms are governed by the laws of Alberta and the applicable federal laws of Canada.' },
    ],
  },
  {
    id: 'severability',
    num: '15',
    title: 'Severability',
    body: [
      { type: 'p', text: 'If any provision is found unenforceable, the remaining provisions remain in effect.' },
    ],
  },
  {
    id: 'entire-agreement',
    num: '16',
    title: 'Entire Agreement',
    body: [
      { type: 'p', text: 'These Terms constitute the entire agreement regarding the services unless replaced by a written agreement signed by both parties.' },
    ],
  },
  {
    id: 'changes',
    num: '17',
    title: 'Changes',
    body: [
      { type: 'p', text: 'Go Fast may update these Terms from time to time. Updated Terms become effective upon publication on the website.' },
    ],
  },
]

// Document metadata last-modified date (docProps/core.xml, dcterms:modified) —
// the real revision date of the source .docx, not a placeholder.
const LAST_UPDATED = 'July 17, 2026'

export default function TermsPage() {
  return (
    <LegalDocLayout
      eyebrow="Legal"
      breadcrumbLabel="Terms & Conditions"
      headingParts={[
        { text: 'Terms & ', color: 'black' },
        { text: 'Conditions', color: 'green', highlight: true },
      ]}
      intro="These Terms and Conditions govern the use of Go Fast Delivery's courier and delivery services. Please read them carefully before booking a shipment."
      lastUpdated={LAST_UPDATED}
      sections={SECTIONS}
    />
  )
}
