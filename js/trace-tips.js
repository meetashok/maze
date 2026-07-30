/**
 * Parent-facing stroke cues and encouragement for Trace.
 * Phrasing is inspired by common manuscript teaching (e.g. Zaner-Bloser
 * “pull down / slide right / circle back”), written for ages 3–5.
 * Not affiliated with any curriculum publisher.
 */

const LETTER_TIPS = {
  A: {
    steps: ["Start at the top peak — slant down left.", "Lift. From the same peak — slant down right.", "Lift. Slide a short bar across the middle."],
    coach: "Say “peak, left, right, belt” while they trace.",
  },
  B: {
    steps: ["Pull down the tall stick.", "Lift. At the top, curve out a small bump back to the stick.", "From the middle, curve a bigger bump down to the bottom."],
    coach: "Two bumps: little one on top, bigger one below.",
  },
  C: {
    steps: ["Start near the top-right. Curve left, down, and around — leave the right side open."],
    coach: "Like a cookie with a bite taken out on the right.",
  },
  D: {
    steps: ["Pull down the tall stick.", "Lift. From the top, curve out and around back to the bottom of the stick."],
    coach: "Stick first, then a big tummy curve.",
  },
  E: {
    steps: ["Pull down the tall stick.", "Lift. Slide right across the top.", "Lift. Slide a shorter bar across the middle.", "Lift. Slide right across the bottom."],
    coach: "Stick, then three shelves — top, middle, bottom.",
  },
  F: {
    steps: ["Pull down the tall stick.", "Lift. Slide right across the top.", "Lift. Slide a shorter bar across the middle."],
    coach: "Like E, but no bottom shelf.",
  },
  G: {
    steps: ["Start near the top-right. Curve almost all the way around like a big C.", "Lift. From the middle, slide right to make the chin."],
    coach: "Make a C, then give it a little chin sliding right.",
  },
  H: {
    steps: ["Pull down the left stick.", "Lift. Pull down the right stick.", "Lift. Slide across the middle to connect them."],
    coach: "Two poles and a bridge — that’s the usual school order.",
  },
  I: {
    steps: ["Pull down the tall stick in the middle.", "Lift. Slide a short hat across the top.", "Lift. Slide a short base at the bottom."],
    coach: "Stick first, then hat, then shoes.",
  },
  J: {
    steps: ["Slide a short hat across the top.", "Lift. Pull down, then curve left at the bottom like a hook."],
    coach: "Hat, then a fishing hook.",
  },
  K: {
    steps: ["Pull down the tall stick.", "Lift. From the top-right, slant in to the middle of the stick.", "From that middle point, slant out down to the bottom-right."],
    coach: "Stick, then a kick in and a kick out.",
  },
  L: {
    steps: ["Pull down the tall stick, then slide right along the bottom — one path."],
    coach: "Down the wall, across the floor.",
  },
  M: {
    steps: ["Pull down the left stick.", "Lift. From the top-left, slant down to the middle.", "From that middle, climb up to the top-right.", "Lift. Pull down the right stick."],
    coach: "Left pole, mountain middle, right pole — lifts between parts are OK.",
  },
  N: {
    steps: ["Pull down the left stick.", "Lift. From the top-left, slant down to the bottom-right.", "Lift. Pull down the right stick."],
    coach: "Left pole, diagonal zip, right pole.",
  },
  O: {
    steps: ["Start at the top. Circle all the way around back to where you began."],
    coach: "A closed oval — keep going until you meet the start.",
  },
  P: {
    steps: ["Start at the top. Pull down the tall stick.", "Lift. Back at the top, curve out a bowl that meets the stick in the middle."],
    coach: "Stick from the top first — then the bowl. Don’t start at the bottom!",
  },
  Q: {
    steps: ["Start at the top. Circle all the way around like O.", "Lift. Add a short tail that sticks out the bottom-right."],
    coach: "An O wearing a little kick tail.",
  },
  R: {
    steps: ["Start at the top. Pull down the tall stick.", "Lift. Curve a P-style bowl back to the middle.", "From the middle, slant a leg down to the bottom-right."],
    coach: "P first, then give it a kicking leg.",
  },
  S: {
    steps: ["Start near the top-right. Curve left, then snake down the other way to the bottom-left."],
    coach: "A slippery snake — top curve, then bottom curve.",
  },
  T: {
    steps: ["Slide a long bar across the top.", "Lift. Pull down from the middle of that bar."],
    coach: "Tabletop, then the leg in the middle.",
  },
  U: {
    steps: ["Start at the top-left. Pull down, curve along the bottom, then push up to the top-right."],
    coach: "Like a smile or a cup — down, around, up.",
  },
  V: {
    steps: ["From the top-left, slant down to the bottom point.", "Lift. From the top-right, slant down to the same point."],
    coach: "Two slides that meet at the bottom — lift between them if you want.",
  },
  W: {
    steps: ["Slant down from the top-left.", "Lift. From the middle peak, slant down left to meet it.", "From that peak, slant down right.", "Lift. From the top-right, slant down to meet it."],
    coach: "Two little mountains — you can lift between the sides.",
  },
  X: {
    steps: ["Start at the top-left. Slant down to the bottom-right.", "Lift. From the top-right, slant down to the bottom-left."],
    coach: "Two crossing slides — left-to-right, then right-to-left.",
  },
  Y: {
    steps: ["From the top-left, slant down to the middle.", "Lift. From the top-right, slant down to the same middle.", "Pull down from the middle to the bottom."],
    coach: "Two arms meet, then one stem.",
  },
  Z: {
    steps: ["Slide across the top, slant down to the bottom-left, then slide across the bottom."],
    coach: "Zip top, zip diagonal, zip bottom.",
  },
};

const DIGIT_TIPS = {
  0: {
    steps: ["Start at the top. Circle all the way around back to the start."],
    coach: "A tall oval — same idea as the letter O.",
  },
  1: {
    steps: ["Start at the top. Pull straight down."],
    coach: "One simple stick. Start high!",
  },
  2: {
    steps: ["Start on the left of the top curve. Sweep around, then slide down diagonally, then across the bottom."],
    coach: "Curve on top, then a ski slope to the base.",
  },
  3: {
    steps: ["Make the top bump, starting on the left.", "From the middle, curve the bottom bump down to the left."],
    coach: "Two open bumps stacked — don’t close them into an 8.",
  },
  4: {
    steps: ["From the top, slant down-left, then slide right across.", "Lift. Pull a tall stick down through the crossbar."],
    coach: "Make the angle and belt, then the long pole.",
  },
  5: {
    steps: ["Slide left across the top, pull down, then curve a belly out and around to the left."],
    coach: "Hat, short stick, then a round tummy.",
  },
  6: {
    steps: ["Start near the top-right. Curve down and around into a loop at the bottom."],
    coach: "Start high, spiral into a little bowl.",
  },
  7: {
    steps: ["Slide across the top, then slant down to the bottom."],
    coach: "Hat first, then a long slide down.",
  },
  8: {
    steps: ["Start at the top. Make a small top loop, then a bigger bottom loop, and close back at the top."],
    coach: "Two stacked circles that share a middle waist.",
  },
  9: {
    steps: ["Start at the top. Circle a bowl (like a small O).", "From the right side of the bowl, pull a stem down."],
    coach: "Bowl on top first — then the stick. Don’t start at the bottom!",
  },
};

/** Short tips for encouraging young writers. */
export const ENCOURAGE_TIPS = [
  "Sit beside them and trace in the air together before they try on screen.",
  "Praise the try: “I love how you started at the green dot!”",
  "If they’re frustrated, do one stroke for them, then let them do the next.",
  "Keep sessions short — one or two letters is a win for ages 3–5.",
  "Say the steps out loud while they move (“pull down… slide right”).",
  "It’s okay to lift between strokes — that’s how handwriting is taught.",
  "Print a worksheet and let them use a crayon after practicing on screen.",
  "Celebrate finished letters with a high-five, not only perfect lines.",
  "Point to the glowing start dot each time: “We always start here.”",
  "If a stroke goes wild, smile and tap Start Over — no big deal.",
];

export function getGlyphTip(kind, glyph) {
  const key = String(glyph);
  if (kind === "number") return DIGIT_TIPS[key] || null;
  return LETTER_TIPS[key.toUpperCase()] || null;
}

export function encourageTipForGlyph(glyph) {
  const s = String(glyph);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 1)) % ENCOURAGE_TIPS.length;
  return ENCOURAGE_TIPS[h];
}
