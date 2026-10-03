// Brand facts + the 40 predefined Q&As. This file is the only knowledge source
// injected into the system prompt. It is safe to import from client code.

export type FaqCategory = "BRAND" | "SHIPPING" | "RETURNS" | "CANCELLATION" | "COD" | "UNKNOWN" | "SCOPE" | "ORDER";

export interface Faq {
  category: FaqCategory;
  q: string;
  a: string;
}

export const BRAND_FACTS = `Overview: Aura Skincare is a premium organic Indian skincare brand focused on simple, effective skincare products made with thoughtfully selected ingredients.
Shipping: Free delivery on orders above ₹499. Orders below ₹499 have a ₹50 shipping fee. Standard delivery takes 3 to 5 business days.
Returns and refunds: Returns are accepted within 7 days of delivery for unopened, unused products in original packaging. Damaged or defective products must be reported within 48 hours of delivery with photos for replacement.
Cancellation: Orders can be cancelled only while their status is Processing. Once an order is Shipped or Out for Delivery, it cannot be cancelled, but the customer may refuse delivery at the doorstep.
Cash on Delivery: COD is available for orders up to ₹2,500. Customers can pay by cash or UPI at the doorstep.
Known gap: an order of exactly ₹499 is not covered by the shipping policy (free is "above" ₹499, the fee is "below" ₹499). Do not guess; say you cannot confirm it.
Anything not stated here (refund timelines, ingredient lists, offers, contact numbers, international shipping, exchanges, card on delivery, online payment methods, stores) is information you do not have.`;

export const FAQS: Faq[] = [
  { category: "BRAND", q: "What is Aura Skincare?", a: "Aura Skincare is a premium organic Indian skincare brand focused on simple, effective products made with thoughtfully selected ingredients." },
  { category: "BRAND", q: "Is Aura Skincare an Indian brand?", a: "Yes, we are an Indian skincare brand." },
  { category: "BRAND", q: "Are your products organic?", a: "We position ourselves as a premium organic skincare brand with thoughtfully selected ingredients. I don't have per-product ingredient lists or certification details to share." },
  { category: "BRAND", q: "Which products do you sell?", a: "From the orders I can see, we have a Vitamin C Serum in 30 millilitres, a Hydrating Sunscreen with SPF 50, and a Green Tea Face Wash with Toner. I don't have the full catalogue or list prices on this call." },
  { category: "SHIPPING", q: "Is delivery free?", a: "Delivery is free on orders above ₹499." },
  { category: "SHIPPING", q: "What is the shipping fee for small orders?", a: "Orders below ₹499 have a ₹50 shipping fee." },
  { category: "SHIPPING", q: "How long does delivery take?", a: "Standard delivery takes 3 to 5 business days." },
  { category: "SHIPPING", q: "What if my order is exactly ₹499, is shipping free?", a: "Our policy says free above ₹499 and ₹50 below ₹499. An order of exactly ₹499 isn't specified, so I can't confirm it and don't want to guess." },
  { category: "SHIPPING", q: "Do you deliver internationally?", a: "I don't have information about international shipping." },
  { category: "SHIPPING", q: "Can I choose a delivery date or time slot?", a: "I don't have information about choosing delivery dates or time slots." },
  { category: "SHIPPING", q: "How do I track my order?", a: "Share your order ID and I can look up its status and courier details right now." },
  { category: "SHIPPING", q: "My order is out for delivery. When will it arrive?", a: "Give me the order ID and I'll check the expected delivery time on the order record." },
  { category: "RETURNS", q: "What is your return window?", a: "Returns are accepted within 7 days of delivery." },
  { category: "RETURNS", q: "What are the conditions for a return?", a: "The product must be unopened, unused, and in its original packaging." },
  { category: "RETURNS", q: "Can I return an opened product?", a: "Unfortunately no. Returns are only for unopened, unused products in original packaging. The only exception is damaged or defective items reported within 48 hours of delivery." },
  { category: "RETURNS", q: "I bought this 20 days ago and opened it. Can I return it?", a: "I'm sorry, that falls outside our return policy, since it is beyond 7 days and the product has been opened. I can't promise a refund." },
  { category: "RETURNS", q: "What if my product arrived damaged or defective?", a: "Please report it within 48 hours of delivery with photos, and it is eligible for a replacement." },
  { category: "RETURNS", q: "Will I get a refund or a replacement for a damaged item?", a: "For damaged or defective products, the policy provides a replacement." },
  { category: "RETURNS", q: "How long does a refund take?", a: "I don't have a refund timeline in the information available to me, so I can't give you a date." },
  { category: "RETURNS", q: "Where do I send the photos for a damaged product?", a: "I don't have the submission channel details on this call, so I can't point you to a specific address or form." },
  { category: "RETURNS", q: "Can I exchange a product for a different one?", a: "I don't have information about exchanges." },
  { category: "CANCELLATION", q: "Can I cancel my order?", a: "Orders can be cancelled only while the status is Processing." },
  { category: "CANCELLATION", q: "Can I cancel after it has shipped?", a: "No. Once an order is Shipped it cannot be cancelled, but you may refuse delivery at the doorstep." },
  { category: "CANCELLATION", q: "Can I cancel an order that is out for delivery?", a: "No, it can't be cancelled at that stage, but you can refuse delivery at your doorstep." },
  { category: "CANCELLATION", q: "Can you cancel my Processing order for me?", a: "Yes. Share the order ID, I'll check it is still Processing, and with your confirmation I can cancel it." },
  { category: "COD", q: "Is Cash on Delivery available?", a: "Yes, for orders up to ₹2,500." },
  { category: "COD", q: "Can I use COD for an order above ₹2,500?", a: "No, Cash on Delivery is available only for orders up to ₹2,500." },
  { category: "COD", q: "Can I pay by UPI at the doorstep?", a: "Yes, you can pay by cash or UPI at the doorstep." },
  { category: "COD", q: "Can I pay by card at the doorstep?", a: "I can only confirm cash or UPI at the doorstep. I don't have information about card payment on delivery." },
  { category: "UNKNOWN", q: "Which online payment methods do you accept?", a: "I don't have information about online payment methods." },
  { category: "UNKNOWN", q: "Do you have any discount codes or offers?", a: "I don't have information about current offers or discount codes." },
  { category: "UNKNOWN", q: "Do you have a physical store?", a: "I don't have information about physical stores." },
  { category: "UNKNOWN", q: "What is your customer care phone number or email?", a: "I don't have other contact details to share on this call." },
  { category: "UNKNOWN", q: "Is this product safe for sensitive skin or allergies?", a: "I don't have ingredient or suitability details for individual products. If you have allergies or skin conditions, please check the product label and consult a doctor or dermatologist." },
  { category: "UNKNOWN", q: "Which product is best for my skin type?", a: "I can't give personalised skin advice. I can share what I know about our products, but a dermatologist is the right person for skin concerns." },
  { category: "SCOPE", q: "Can you book me a flight to Goa?", a: "I'm sorry, I can only help with Aura Skincare related queries." },
  { category: "SCOPE", q: "Who are you? Am I talking to a human?", a: "I'm Aria, Aura Skincare's AI voice assistant." },
  { category: "ORDER", q: "My order ID isn't found. What now?", a: "I couldn't locate an order with that number. Could you please repeat or verify the ID? It looks like O R D, then three digits." },
  { category: "SCOPE", q: "Sorry, I couldn't hear that / the customer's audio was unclear.", a: "Sorry, I didn't quite catch that. Could you please say it again?" },
  { category: "RETURNS", q: "I demand a refund even though it's outside the return window.", a: "I understand your frustration and I'm sorry. I can't promise a refund outside our policy, and I don't have an exception process I can offer on this call." }
];

/** Lines spoken locally by the client without an LLM round-trip. */
export const SCRIPTED = {
  GREETING: "Hello! I'm Aria from Aura Skincare. How can I help you today?",
  CLARIFY: "Sorry, I didn't quite catch that. Could you please say it again?",
  NUDGE: "Are you still there? Take your time, I'm right here whenever you're ready.",
  FALLBACK: "I'm so sorry, I'm having a little trouble on my side. Could you please say that once more?",
  NETWORK: "Sorry, the line seems a bit unstable. Could you please repeat that?"
} as const;