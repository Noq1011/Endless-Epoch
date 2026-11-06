/*:
 * @plugindesc v3.0 Codex System - Optimized UI, Layering, & WordWrap Fix
 * @author You / Gemini
 *
 * @help
 * Script Calls:
 * Codex.unlock("id");      // Unlocks entry and queues a map notification
 */

var Imported = Imported || {};
Imported.Noq_CodexSystem = true;

var Codex = Codex || {};
window.Codex = Codex;

(function() {

    //-----------------------------------------------------------------------------//
    // 🔹 DATABASE (Your database goes here!)
    //-----------------------------------------------------------------------------//
 Codex.Database = [
        { 
            id: "history_first_schism", 
            title: "The First Schism", 
            category: "History", 
            text: [
                "The First Schism marked the collapse of unity among the Serah’ti. What was once a singular resonance splintered into discordant echoes...",
                "Further study reveals that the guardians didn't just retreat; they were exiled by the very frequencies they swore to protect.",
                "The final truth of the Schism is darker: the 'Void' they retreated into is actually the source of the Second Verse."
            ] 
        },
        { 
            id: "verse_fundamentals", 
            title: "Verse Fundamentals", 
            category: "Verse", 
            text: [
                "All Verse originates from a primal resonance embedded in creation.",
                "Advanced harmonizers can detect 'Ghost Notes'—remnants of realities that failed to vibrate correctly."
            ] 
        },
    { id: "char_zaeldrah", title: "Zael’Drah", category: "Characters", text: ["The Divine Dog of Order, guardian of balance among the Serah’ti. It is said his bark can stabilize a collapsing reality."] },
    { id: "faction_church", title: "The Church", category: "Factions", text: ["The Church governs the interpretation of divine will through strict rhythmic adherence."] },
    { id: "beast_serahti", title: "Serah’ti", category: "Bestiary", text: ["Ancient beings born from divine Verse. They are neither physical nor spiritual, but purely harmonic."] },
    { id: "attuned_tracker", title: "Divine Beast Tracker", category: "Artifacts", text: ["A relic from the Tower of Prudence used to detect divine beasts by measuring local dissonance."] },
    { id: "glossary_verse", title: "Verse", category: "Glossary", text: ["The fundamental energy that shapes reality."] },
	{
  id: "divine_eleceah_reflections",
  title: "Divine Reflections — Eleceah",
  category: "History",
  text: [
    "I created humans because I was lonely. The stars did not sing. The stone did not smile. I gave them breath and beauty and rhythm — and still they killed each other.",
    
    "So I gave them a song, and watched them forget the melody. Each Note I sing is a thread of mercy. A promise. And with each corrupted soul, a note falters.",
    
    "You wonder why crops fail? Why children die in womb? It is because the silence draws near. The Last Note waits… and I am so tired.",
    
    "The First did not want them. I begged the First to see their potential, but they would not listen. I sang humanity into being so my music would echo across time.",
    
    "I know betrayal by name. It wears robes. It holds books. It speaks my name and cuts my throat. But even in betrayal, there is music. Even in corruption… I can still sing."
  ]
},

{
  "id": "lore_well_and_weight",
  "title": "The Well & Soul Weight",
  "category": "History",
  "text": [
    "The fundamental law of mortality in Merithea dictates that every spirit carries a physical density known as Soul Weight. Pure, virtuous souls float atop the Well of Souls, immediately spun back into the Song of Creation. Unvirtuous souls—weighted by moral sin—sink to the bottom, requiring decades of soaking in divine waters to dissolve their guilt.",
    "Because sunken souls delay the cycle of rebirth, Goddess Eleceah is forced to expend her own divine essence to knit replacement spirits, causing her voice to wane over centuries. Conversely, souls infected by metaphysical corruption become too heavy to ascend at all, remaining trapped on Merithea as the mutated monsters roaming the wilderness.",
    "This cosmological reality dictates Church law: executing sinners is strictly avoided, as sending heavy souls to the Well directly drains the Goddess. Instead, the Order utilizes exile or mind-reformation on mortals, deploying its military wing primarily to cleanse surface monsters and release their trapped spirits to the light."
  ]
},

{
  id: "divine_cradle_psalms",
  title: "Cradle Psalms — Creation",
  category: "History",
  text: [
    "I created humans because… I wanted someone to sing back to me.",
    
    "I sang alone for eons, my verses echoing in the void, birthing galaxies, oceans, wolves, and stars. The First heard me, but did not respond.",
    
    "So I created a people with imperfection — those who cry when they lose, and sing when they hope.",
    
    "When they feel pain, they scream. When they feel love, they write poems. That is harmony. That is creation."
  ]
},

 {
  id: "char_laya_fragmented_self",
  title: "L’Aya — Before Awakening",
  category: "Characters",
  text: [
    "I walk among them, yet I am not them. I laugh, I bleed, I love… yet something in me does not belong.",
    
    "The stars whisper truths I cannot grasp. There is a weight in my chest, older than memory.",
    
    "The man with lightning in his eyes sees me. I want to hide, but I cannot.",
    
    "What will they say… when they find out I am their mother?"
  ]
},

{
  id: "char_laya_dual_self",
  title: "The Weight of Two Selves",
  category: "Characters",
  text: [
    "I remember prayers spoken by a girl who didn’t know she was me.",
    
    "Cold cathedral floors. The taste of stolen honey. The sharp guilt after every lie.",
    
    "To become divine is not to ascend — it is to fracture.",
    
    "The goddess and the girl walk beside each other now. One of us wants to sing. The other wants to scream."
  ]
},
 
{
  id: "char_kai_regret",
  title: "Kai Eurion — Personal Memory",
  category: "Characters",
  text: [
    "They said I corrupted her. That my touch tainted her voice.",
    
    "Maybe they’re right. Maybe if I hadn’t… maybe Charmaine would still be alive.",
    
    "But if that’s the truth… then I was never worthy of her light to begin with."
  ]
},

{
  id: "char_isaiah_truth",
  title: "Isaiah Washven — On Truth",
  category: "Characters",
  text: [
    "Books lie. Priests lie. Even the goddess… perhaps even she can be wrong.",
    
    "I followed every Verse like a holy chord. But scripture does not soothe a soul that doubts.",
    
    "In the Ariad, I heard something different. Not doctrine. Not command.",
    
    "Faith. Real faith. And for the first time… it resonated."
  ]
},
  
  {
  id: "char_mayleen_fire",
  title: "Mayleen — The Ember’s Edge",
  category: "Characters",
  text: [
    "I threatened to set a man’s eyebrows on fire for cheating me out of five gold. I smiled while doing it.",
    
    "Maybe that’s the part that scares people. But the truth is — I’m scared too.",
    
    "If I stop laughing… if I stop shouting… I’ll hear the silence I ran away from.",
    
    "And silence always burns hotter than fire."
  ]
},

{
  id: "char_syfer_mirror",
  title: "Syfer Regald — The Mirror",
  category: "Characters",
  text: [
    "I see his face in mine. My brother. My shame. My failure.",
    
    "I should have stopped him. I should’ve done something.",
    
    "But I watched. I let him fall into darkness…",
    
    "And maybe that’s where I belong too."
  ]
},

  {
  id: "echo_teyorimn_balance",
  title: "Teyorimn — On Balance",
  category: "History",
  text: [
    "Peace is boring. Chaos unchecked will destroy everything.",
    
    "How do you balance it?",
    
    "That’s the creator’s quandary…",
    
    "And no one ever got it right. Not even her."
  ]
},

{
  id: "faction_mesrunein_scroll",
  title: "Scroll of Splintered Flame",
  category: "Factions",
  text: [
    "He said we were not broken — only bent by the laws of men.",
    
    "That no soul needed to be erased to be purified.",
    
    "That divinity could not be owned, only honored.",
    
    "We followed him into exile… and in exile, we found clarity."
  ]
},

{
  id: "glossary_true_light_mantra",
  title: "The True Light Mantra",
  category: "Glossary",
  text: [
    "“Pray for Fire.”",
    
    "Spoken between strangers of the same sect to affirm allegiance.",
    
    "It is whispered on battlefields, muttered in passing, and howled in sacred chambers.",
    
    "Its meaning changes with tone — a greeting, a challenge, or a prayer."
  ]
},

{
  id: "legend_mirella",
  title: "Mirella, the Tidesworn",
  category: "History",
  text: [
    "They called her the storm when she was wild. The lighthouse when she stood still. The goddess when she was gone.",
    
    "Mirella is believed to have been born when the ocean consumed the Adellon Mountains — a woman made of storm and sea.",
    
    "Her Verse was never classified. It surged like a tide, struck like a storm, and vanished like memory.",
    
    "She guided fleets, sank smugglers, and stood in silence as people began to worship her.",
    
    "Mirella vanished without explanation. The Church denies her. The sea does not."
  ]
},
  
{
  id: "history_destroyer_origin",
  title: "When the World Died, It Chose a Womb",
  category: "History",
  text: [
    "The Destroyer did not fall into corruption — he was remade by it.",
    
    "When Brim collapsed, its divine energy flooded the Veil and gathered where all endings go.",
    
    "There, in the shatterlight of a broken sky, something new was born.",
    
    "A being that remembered creation… and watched it unravel note by note."
  ]
},
  
 {
  id: "history_destroyer_reflection",
  title: "Is He Miserable, or Just Becoming?",
  category: "History",
  text: [
    "Once, we believed he gave us Brim as freedom — no law, no chaos.",
    
    "Now we see how his presence stains this world, even where Eleceah no longer sings.",
    
    "Maybe he wanted more than one world. Maybe something beyond divine.",
    
    "Or maybe… he no longer knows what he is."
  ]
},
 
  {
  id: "history_teyorimn",
  title: "The One Who Heard Tomorrow",
  category: "History",
  text: [
    "He was called Teyorimn. Or Teyora. The name changes in every echo.",
    
    "He listened where no one else could… and saw the world end seven ways before it began.",
    
    "Some say he was born between Verses. Others say he was a contradiction made flesh.",
    
    "He vanished not from space… but from sequence."
  ]
},

{ 
  id: "cosmology_song_creation", 
  title: "The Song of Creation", 
  category: "Verse", 
  text: [
    "The Song of Creation is the foundational harmonic structure from which all reality emerges.",
    "All life, matter, and Verse affinities are fragments of this infinite divine composition.",
    "The Song is not static — it evolves, fractures, and recomposes itself across time.",
    "When harmony is stable, the world flourishes. When it fractures, corruption spreads."
  ]
},

{ 
  id: "cosmology_erebis_doctrine", 
  title: "Erebis — Doctrine of Silence", 
  category: "History", 
  text: [
    "Erebis is defined by the Church as a primordial force of unmaking that opposes divine order.",
    "He is considered the antithesis of creation and the origin of corruption.",
    "Doctrine states that Erebis seeks the end of all Song and the return of silence.",
    "His influence is treated as heresy, myth, or misinterpretation of divine entropy."
  ]
},

{ 
  id: "cosmology_erebis_observation", 
  title: "Erebis — Observed Phenomena", 
  category: "History", 
  text: [
    "Unnatural silence precedes major Verse collapses and divine instability events.",
    "Certain individuals report hearing their own thoughts echoed before corruption spreads.",
    "Regions near Brim anomalies exhibit reduced harmonic resonance and emotional flattening.",
    "These effects are consistent but cannot be directly attributed to any known entity."
  ]
},

{ 
  id: "cosmology_erebis_truth", 
  title: "Erebis — Primordial Silence", 
  category: "History", 
  text: [
    "Erebis is not a being in opposition to creation, but the condition before it.",
    "He represents entropy not as destruction, but as inevitability.",
    "All Songs are temporary deviations within his silence.",
    "Creation exists as delay, not escape."
  ]
},

{
  id: "brim_definition_doctrine",
  title: "Brim — The Forbidden Realm",
  category: "History",
  text: [
    "Brim is described by the Church as a corrupted realm created by the Destroyer.",
    "It is believed to be the source of all corruption, mutation, and Verse distortion.",
    "Entry into Brim is strictly forbidden under divine law.",
    "All anomalies are attributed to Brim-born influence."
  ]
},

{
  id: "brim_observed_effects",
  title: "Brim — Observable Effects",
  category: "History",
  text: [
    "Localized reality instability occurs near known Brim fractures.",
    "Time perception distortions have been recorded in affected regions.",
    "Verse users report auditory hallucinations resembling incomplete Song fragments.",
    "Physical matter may exhibit non-linear degradation or resonance decay."
  ]
},

{
  id: "brim_truth_hollowing",
  title: "Brim — The Hollowing Event",
  category: "History",
  text: [
    "A Hollowing occurs when reality becomes saturated with unresolved collapse.",
    "It is not a creation event, but a rupture in existing harmonic structure.",
    "From these ruptures, Brimkar Echoes may manifest.",
    "Brim is not a place — it is a condition of failed resonance."
  ]
},

{
  id: "creation_eleceah_doctrine",
  title: "Eleceah — Divine Creator",
  category: "Characters",
  text: [
    "Eleceah is worshipped as the goddess of the Song of Creation.",
    "She is believed to have shaped all existence through divine resonance.",
    "The Holy Order teaches that she actively maintains reality through the Well of Souls.",
    "All Verse magic is considered fragments of her will."
  ]
},

{
  id: "creation_eleceah_observation",
  title: "Eleceah — Observed Divinity",
  category: "Characters",
  text: [
    "The Well of Souls shows measurable degradation correlated with world corruption events.",
    "Divine Songstress failures result in immediate global resonance instability.",
    "Regions near active Towers exhibit heightened emotional and magical sensitivity.",
    "These patterns suggest a centralized metaphysical dependency."
  ]
},

{
  id: "creation_eleceah_truth",
  title: "Eleceah — The Singing Delay",
  category: "Characters",
  text: [
    "Eleceah is not separate from the Song — she is its current expression.",
    "She is not origin, but continuity — a delay in inevitable silence.",
    "Her existence is tied to sustaining divergence from Erebis.",
    "She does not create reality. She maintains its refusal to end."
  ]
},

{
  id: "system_verse_origin",
  title: "Verse — Fundamental Structure",
  category: "Verse",
  text: [
    "Verse is the resonant fragmentation of the Song of Creation.",
    "Each Verse represents a localized interpretation of divine harmony.",
    "Users align with Verse affinities based on emotional and environmental resonance.",
    "Verse stability determines physical and metaphysical consistency."
  ]
},

{
  id: "system_subversers",
  title: "Subversers — Resonance Anomalies",
  category: "Verse",
  text: [
    "Subversers are Verse users born under extreme harmonic distortion events.",
    "Their affinities do not follow standard elemental classification.",
    "They are considered unstable expressions of the Song.",
    "The Church monitors them as both assets and threats."
  ]
},

{
  id: "serathi_origin_doctrine",
  title: "Serah’Ti’Ari — Divine Prototype Race",
  category: "Factions",
  text: [
    "The Serah’Ti’Ari are classified by the Holy Order as the first divine prototype civilization.",
    "They are described as beings of perfect order, designed to maintain cyclical harmony without deviation.",
    "Doctrine states they were rendered obsolete after the gift of free will to humanity.",
    "They are considered extinct or sealed away in sacred isolation."
  ]
},

{
  id: "serathi_behavior_observation",
  title: "Serah’Ti’Ari — Cycle Behavior",
  category: "Factions",
  text: [
    "Serah’Ti’Ari societies operate on fixed, repeating behavioral cycles.",
    "Individuals perform identical daily rituals with no variation across generations.",
    "Deviation from cycle behavior only occurs under external divine influence.",
    "Their environments remain structurally unchanged over extended periods."
  ]
},

{
  id: "serathi_truth_fracture",
  title: "Serah’Ti’Ari — The Stillness Before Choice",
  category: "Factions",
  text: [
    "The Serah’Ti’Ari are not failed creations, but an intentional state of pre-choice existence.",
    "They represent a world before deviation, where existence required no decision.",
    "Corruption entered only when external divine forces introduced variability.",
    "They are not obsolete — they are what the world was before becoming unstable."
  ]
},

{
  id: "destroyer_doctrine",
  title: "The Destroyer — Church Interpretation",
  category: "History",
  text: [
    "The Destroyer is regarded by the Holy Order as a corrupting divine adversary.",
    "He is blamed for introducing corruption into the Song of Creation.",
    "Doctrine states he was banished by Eleceah during the First Schism.",
    "All Brim-related anomalies are attributed to his influence."
  ]
},

{
  id: "destroyer_observation",
  title: "The Destroyer — Whisper Phenomena",
  category: "History",
  text: [
    "Individuals near corruption zones report internal voice duplication and suggestion loops.",
    "Thought patterns shift toward destructive inevitability under prolonged exposure.",
    "No external signal or Verse signature can be directly traced.",
    "Influence appears internal rather than external in origin."
  ]
},

{
  id: "destroyer_truth",
  title: "The Destroyer — Systemic Pressure",
  category: "History",
  text: [
    "The Destroyer is not a singular entity but a systemic counter-pressure to creation.",
    "He manifests where the Song becomes unstable or overextended.",
    "His influence increases as harmony decays, not through action but through inevitability.",
    "He is less a being, more a corrective force within reality."
  ]
},

{
  id: "severance_doctrine",
  title: "Severance — Forbidden Heresy",
  category: "Verse",
  text: [
    "Severance is classified by the Church as a forbidden heretical Verse.",
    "It is believed to sever individuals from divine connection and the Song of Creation.",
    "Doctrine claims it is a corrupted myth used by traitors and schismatics.",
    "Its existence is officially denied in sanctioned scripture."
  ]
},

{
  id: "severance_observation",
  title: "Severance — Resonance Cut Phenomenon",
  category: "Verse",
  text: [
    "Subjects affected by Severance lose measurable connection to Verse resonance fields.",
    "Their presence does not register in divine harmonic detection systems.",
    "Some individuals retain memory but lose emotional or spiritual continuity.",
    "Effects appear permanent and non-reversible through known means."
  ]
},

{
  id: "severance_truth",
  title: "Severance — Wound in the Song",
  category: "Verse",
  text: [
    "Severance is not a spell but a rupture embedded within the Song of Creation.",
    "It functions as a deliberate cut in divine continuity.",
    "Its origin predates modern Church understanding of Verse systems.",
    "It does not remove connection — it erases the capacity to reconnect."
  ]
},

{
  id: "brimkar_doctrine",
  title: "Brimkar Echoes — Church Classification",
  category: "Bestiary",
  text: [
    "Brimkar Echoes are classified as corrupted entities originating from Brim.",
    "They are considered remnants of failed divine or Verse constructs.",
    "Doctrine states they appear during extreme corruption events.",
    "They are to be eradicated on sight by Church enforcement units."
  ]
},

{
  id: "brimkar_observation",
  title: "Brimkar Echoes — Emergence Conditions",
  category: "Bestiary",
  text: [
    "Brimkar Echoes manifest following localized reality collapse events.",
    "Their appearance is often preceded by emotional voids or environmental silence.",
    "They do not exhibit consistent biological or magical structure.",
    "Their behavior suggests memory-driven rather than instinct-driven existence."
  ]
},

{
  id: "brimkar_truth",
  title: "Brimkar Echoes — Residual Memory Forms",
  category: "Bestiary",
  text: [
    "Brimkar Echoes are not living beings, but residual memory structures of collapsed reality.",
    "They represent the world’s attempt to recall what was lost during rupture.",
    "They are not created by Brim, but exposed through it.",
    "Their existence is a symptom of unresolved cosmological decay."
  ]
},

{
  id: "cycle_well_souls_doctrine",
  title: "Well of Souls — Divine Fuel Source",
  category: "Verse",
  text: [
    "The Well of Souls is the divine reservoir from which Eleceah draws strength.",
    "It is replenished through purified souls returning to the Cycle.",
    "Impure souls are removed through divine purification processes.",
    "Its stability is essential for maintaining global Verse harmony."
  ]
},

{
  id: "cycle_well_souls_observation",
  title: "Well of Souls — Instability Effects",
  category: "Verse",
  text: [
    "Corruption within the Well correlates with widespread Verse instability.",
    "Regions report increased birth defects in Verse affinity alignment.",
    "Emotional resonance across populations becomes erratic.",
    "Global magical systems degrade under prolonged contamination."
  ]
},

{
  id: "cycle_last_note_truth",
  title: "The Last Note — End Condition",
  category: "Verse",
  text: [
    "The Last Note represents the total collapse of divine harmonic stability.",
    "When triggered, Eleceah can no longer sustain the Song of Creation.",
    "Life ceases propagation across all biological and magical systems.",
    "It is not destruction — it is final silence returning."
  ]
},

 {
  id: "church_holy_order_overview",
  title: "The Holy Order of Eleceah",
  category: "Factions",
  text: [
    "The Holy Order governs the worship, interpretation, and administration of Eleceah’s divine will.",
    "It presents itself as the steward of harmony, purity, and sacred continuity.",
    "Its authority reaches into law, ritual, education, and Verse discipline.",
    "To the faithful, the Order preserves the world. To its critics, it controls it."
  ]
},

{
  id: "church_papal_role",
  title: "The Papal — Divine Voice on Earth",
  category: "Characters",
  text: [
    "The Papal is the mortal vessel through which Eleceah’s will is believed to move.",
    "All Papals are born with Light Verse affinity and are treated as reincarnated divine voices.",
    "The Papal does not merely lead the Church — he relays the Song when the Goddess cannot be directly heard.",
    "When the link weakens, the world feels the fracture before the priests do."
  ]
},

{
  id: "church_grand_cardinals",
  title: "Grand Cardinals — Keepers of Rite",
  category: "Characters",
  text: [
    "Grand Cardinals oversee sacred preparation, doctrinal enforcement, and ritual continuity.",
    "They are trained to preserve the Church’s stability during divine emergencies and Festivals of Restoration.",
    "Though powerful, they are not battlefield commanders and rarely speak for public record.",
    "Their silence is considered a sign of discipline, not weakness."
  ]
},

{
  id: "church_capital_mirna",
  title: "Mirna — The New Holy Capital",
  category: "History",
  text: [
    "Mirna became the Holy Order’s capital after the Age of the Frozen Sun shattered confidence in Ellinoft.",
    "Built in Kellou, it was chosen for its resonance stability and symbolic distance from the old catastrophe.",
    "The Grand Cathedral and Dome of Resonance now anchor the Church’s major rites there.",
    "From Mirna, the Order broadcasts authority across the world."
  ]
},

{
  id: "festival_restoration_overview",
  title: "Festival of Restoration — Sacred Reprieve",
  category: "History",
  text: [
    "The Festival of Restoration is not annual, but invoked only when divine strain becomes unsustainable.",
    "It is the moment when Eleceah is believed to drink from the Well of Souls and rest her voice.",
    "The ritual exists to preserve the Song of Creation before corruption overtakes it.",
    "When it succeeds, the world breathes again. When it fails, the silence deepens."
  ]
},

{
  id: "festival_roles_light_echo_spirit",
  title: "Festival Roles — Light, Echo, and Spirit",
  category: "Verse",
  text: [
    "Light Versers serve as conductors, aligning the ritual’s harmonic structure.",
    "Echo Versers preserve resonance, memory, and tonal continuity during the ceremony.",
    "Spirit Versers reinforce intent, keeping the Song from unraveling under strain.",
    "Together, they form the backbone of the Festival’s sacred synchronization."
  ]
},

{
  id: "festival_divine_songstress",
  title: "The Divine Songstress",
  category: "Characters",
  text: [
    "The Divine Songstress is the chosen vessel who carries the Goddess’ Note during the Festival.",
    "She must remain uncorrupted, spiritually clear, and capable of sustaining the highest divine resonance.",
    "Most are rare Light Verse users selected after years of observation and ritual testing.",
    "Her failure does not end the ceremony immediately — but it leaves the world vulnerable to fracture."
  ]
},

{
  id: "festival_failure_last_note",
  title: "Festival Failure — The Last Note",
  category: "History",
  text: [
    "When the Festival fails, the Goddess’ voice does not fully return to strength.",
    "Corruption remains in the Well, and the world begins to drift toward the Last Note.",
    "Fertility weakens, Verse becomes unstable, and divine silence presses closer.",
    "The failure is not always visible at once. Sometimes the world suffers for generations before it realizes."
  ]
},

{
  id: "artifact_edic_of_heaven",
  title: "The Edict of Heaven",
  category: "Artifacts",
  text: [
    "The Edict of Heaven is a living document believed to contain the Song of Creation in written form.",
    "Its pages shift with resonance and cannot be read as ordinary scripture.",
    "Only Eleceah, or a being of equal divine creation, may fully perceive its meaning.",
    "Most who attempt to read it encounter silence, blindness, madness, or fragmented notes of truth."
  ]
},

{
  id: "artifact_elincea_eye_origin",
  title: "Eleceah’s Eye",
  category: "Artifacts",
  text: [
    "Eleceah’s Eye is a monocle-sized divine relic used to perceive hidden Verse and the Edict.",
    "It is associated with Elincia in certain regional records and Church archives.",
    "The Church once recovered it during the sacking of Pelapo, then concealed it in the mountains.",
    "Its purpose was never simple observation — it was a bridge to divine readability."
  ]
},

{
  id: "artifact_eye_and_edict_incident",
  title: "Remy’s Reading of the Edict",
  category: "History",
  text: [
    "Papal Remy pursued a method to decode the Edict by studying the resonance of dragons, Eleceah’s Eyes.",
    "Using an unknown device, he forced partial transcription of the Edict’s contents.",
    "The fragments were incomplete and unstable, but still dangerous enough to trigger a metaphysical rupture.",
    "After the disaster, he sealed the Edict and buried Eleceah’s Eye to prevent further harm."
  ]
},

{
  id: "artifact_re_verse_engine",
  title: "The Re-Verse Engine",
  category: "Artifacts",
  text: [
    "The Re-Verse Engine is a forbidden construct designed to manipulate divine resonance at scale.",
    "Built from remnant research into dragon harmony, it seeks to rewrite or reverse broken Verse.",
    "The Church claims it may restore the Cycle. Its critics claim it is a weapon made to replace a god.",
    "The machine does not simply amplify power — it attempts to force reality into agreement."
  ]
},

{
  id: "re_verse_engine_gilbrandt_intent",
  title: "Gilbrandt’s Hidden Intent",
  category: "Characters",
  text: [
    "Papal Gilbrandt is rumored to seek more than restoration from the Re-Verse Engine.",
    "Some whisper that he intends to sever Eleceah from the Cycle and claim her divine place.",
    "Others believe he wishes to humiliate divinity by forcing it into obedience.",
    "Whatever his goal, the Engine is being treated as a path to authority no mortal should hold."
  ]
},

{
  id: "faction_children_mesrunein",
  title: "The Children of Mesrunein",
  category: "Factions",
  text: [
    "The Children of Mesrunein reject the Church’s monopoly on divine meaning.",
    "They believe free will is sacred, even when it leads to grief, imperfection, or failure.",
    "To them, the Goddess belongs to all who still sing — not only to sanctioned clergy.",
    "They treat many forbidden events as warnings against control, not proof of sin."
  ]
},

{
  id: "faction_threadweavers",
  title: "The Threadweavers",
  category: "Factions",
  text: [
    "The Threadweavers interpret the Song as something living, changing, and unfinished.",
    "They often preserve contradictory myths that the Church dismisses as heresy.",
    "To them, resonance is not only law — it is memory, inheritance, and evolution.",
    "They are among the first to treat divine anomalies as messages instead of errors."
  ]
},

{
  id: "faction_holy_order_view_severance",
  title: "The Holy Order — Severance Doctrine",
  category: "Factions",
  text: [
    "The Holy Order publicly denies that Severance is a true and usable force.",
    "It is described as corrupted myth, ideological poison, or a false memory of heresy.",
    "Privately, the Order studies resonance ruptures and related anomalies in sealed programs.",
    "Its denial is not proof of ignorance. It is often a sign of fear."
  ]
},

{
  id: "faction_mesrunein_view_severance",
  title: "The Children of Mesrunein — On Severance",
  category: "Factions",
  text: [
    "The Children of Mesrunein view Severance as a wound that should never have been opened.",
    "They reject its use as a way to control souls, silence choice, or sever divine inheritance.",
    "To them, the spell is not salvation and not justice — only refusal made violent.",
    "Some among them believe the world is still paying for its first use."
  ]
}, 

{
  "id": "lore_vita_eleceah",
  "title": "Vita Eleceah",
  "category": "History",
  "text": [
    "Compiled by the First Seraphant, Vita Eleceah records the Goddess’s mortal pilgrimage to reclaim her divinity. When Eleceah descended from the Divine Realm to live among humanity, the Song of Creation faltered in her absence—bringing forth world decay, the First Schism, and the rise of the Destroyer. To save Creation, she walked the Seven Paths to re-attune her vessel and return to the heavens.",
    "The scripture’s seven volumes map her mastery over the Virtues: from confronting her role in the decay (Prudence), to forging the Covenant of Verse amidst the Serah’ti'Ari rebellion (Trust), to leaving behind the First Herald to guide mortals (Selflessness). The final volume allegorizes her re-ascension as 'light unraveling flesh upon the Loom.'",
    "Declared high heresy by the Council of Ael’Tor for suggesting that divine authority was reclaimed through virtue and sacrifice rather than enforced through Church dogma, unredacted copies are heavily suppressed. Subversers and scholars view the text as a blueprint for understanding the true nature of the First Age."
  ]
},
  
  {
  "id": "lore_first_herald",
  "title": "The First Herald",
  "category": "History",
  "text": [
    "The mortal companion and sworn protector of Goddess Eleceah during her Reclaiming Pilgrimage. When Eleceah’s descent caused the Song of Creation to falter, the First Herald guided her through the Seven Paths, shielding her muted divine vessel from the world's decay and the rogue Serah’ti’Ari.",
    "During the climax of the First Schism, the Herald rallied mortal clans to defend Eleceah against the Destroyer, holding the threshold of the Seventh Tower while the Goddess dissolved her mortal shell to re-ascend and restart the Song from the Divine Realm.",
    "Left behind to shepherd humanity, the First Herald established the Rite of the Seven Stanzas—a sacred pilgrimage meant to ensure future spiritual leaders possessed genuine virtue. Though modern Church doctrine paints the Herald as a dogmatic sovereign, ancient fragments reveal a humble wanderer who led through empathy rather than law."
  ]
},
  
  {
  "id": "beast_virtuous_bygone",
  "scan": "18_1",
  "title": "Virtuous Bygone",
  "category": "Bestiary",
  "text": [
    "Echoes of devout Papal candidates who perished while attempting the Rite of the Seven Stanzas. Trapped within the high-resonance halls of the Towers, their souls were never reclaimed by the Cauldron, leaving them bound to the stone for centuries.",
    "Their crimson skin is the physical mark of catastrophic Verse Burnout, while the floating, jagged halo above their heads represents the Papal mantle they failed to achieve. Their dark wings and frayed pilgrim tunics mark them as tragic remnants of a forgotten pilgrimage.",
    "Relegated entirely to the Seven Towers, Virtuous Bygones do not strike out of malice. Driven by a lingering, automatic reflex, they endlessly challenge living intruders to prove their worthiness—forcing new pilgrims to endure the same brutal test that claimed their lives."
  ]
},

{
  "id": "beast_hallowed_choir",
  "title": "The Hallowed Choir",
  "category": "Bestiary",
  "text": [
    "A horrific assembly of clergy souls who suffered catastrophic Verse Burnout while holding the Goddess's note or undergoing the Church’s grueling Renewal training. Bound to Earth by their sudden deaths, these hollowed vessels linger in high-resonance ruins.",
    "The Choir comprises three distinct horrors: Sairens (corrupted Divine Songstresses whose throats burst under divine strain), Ritualists (corrupted Grand Cardinals who conduct dark rites), and Hexsings (corrupted Censers and Ordained Flames who act as relentless enforcers). While each can be encountered solo, their assembly into a full Choir is a terrifying, rare occurrence.",
    "When gathered, the Choir sings a dissonant, warped version of the Song of Creation that channels the raw unmaking power of Brim, rotting the surrounding landscape. Those who hear their chorus are bombarded by maddening whispers from the Destroyer, driving all but the most resolute minds into absolute madness."
  ]
},

{
  "id": "lore_rite_seven_stanzas",
  "title": "The Rite of the Seven Stanzas",
  "category": "History",
  "text": [
    "The Rite of the Seven Stanzas is the ancient, sacred pilgrimage required to validate a candidate's capacity to host the Papal mantle. To prove their vessel can endure the immense strain of channeling Goddess Eleceah's divine voice, candidates must travel to all Seven Towers, subjecting their body and spirit to the distinct Virtue Trial housed within each sanctuary.",
    "Rather than testing mere dogmatic recitation, the Rite acts as a rigorous biological and harmonic filter. Each trial subjects the candidate's internal Verse pathways to extreme atmospheric frequencies, forcibly re-tuning their spirit to ensure their vessel will not suffer terminal Verse Burnout when drawing directly from the Well of Souls.",
    "A candidate who successfully completes a trial has their soul marked by the Tower's subterranean engine, accumulating the seven harmonic notes required to complete the divine stanza. Those whose vessels prove biologically or spiritually impure fail the threshold—their spirits bound eternally to the towers as tragic warnings to future aspirants."
  ]
},

{
  "id": "history_fall_of_pelapo",
  "title": "The Fall of Pelapo",
  "category": "History",
  "text": [
    "Once a tranquil valley settlements in the eastern reaches, Pelapo was completely erased from Church maps following a catastrophic Renewal failure. When the village's chosen Divine Songstress failed her oath, a tear in reality opened directly above the settlement, leaking raw Brim corruption into the valley.",
    "Tragically, Church reinforcements arrived too late to contain the anomaly. By the time the Order's Vanguard breached the valley, the entire population had suffered terminal metaphysical corruption, mutating into 'The Bound.' To prevent the infection from spreading across the continent, the military wing enacted an indiscriminate purge, burning Pelapo to ash.",
    "While official Church histories cite the tragedy as a stark warning against defying sacred duties, private scholars note that the sheer volume of corrupted souls created at Pelapo permanently damaged global resonance—marking a dramatic, dark turning point in Papal Gilbrandt's reign."
  ]
},

{
  "id": "lore_charmeine_diary",
  "title": "Charmeine's Hidden Diary",
  "category": "Artifacts",
  "text": [
    "A small, tear-stained journal belonging to Charmeine, the fallen Divine Songstress of Pelapo. Its pages reveal the horrifying physical toll of her training in Mirna, detailing how the pressure of holding the Goddess's note was actively tearing her internal Verse pathways apart.",
    "Shunned by the Grand Cardinals and accused of spiritual weakness for her repeated 'cracking' during recitals, Charmeine realized she was going to die of Verse Burnout. The diary details her desperate plan: to flee to Pelapo to see her love, Kai, one last time before returning to accept her lethal fate at the altar.",
    "The final entry, hastily written in Pelapo, reveals the tragic turning point. Finding solace and safety in Kai's presence, the terrified girl could not bring herself to return to the cold, lethal expectations of the Church—unwittingly setting the stage for the Tear that would consume her home."
  ]
}

  
  ];
    //-----------------------------------------------------------------------------//
    // 🔹 SAVE DATA & STATUS
    //-----------------------------------------------------------------------------//
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._codexUnlocked = this._codexUnlocked || []; 
        this._codexRead = this._codexRead || [];         
        this._codexProgress = this._codexProgress || {}; 
    };

    Codex.getUnlockedCount = function(id) { return $gameSystem._codexProgress[id] || 0; };
    Codex.isUnlocked = function(id) { return this.getUnlockedCount(id) > 0; };
    Codex.isRead = function(id) { return $gameSystem._codexRead.includes(id); };

    Codex.unlock = function(id) {
        const entry = this.Database.find(e => e.id === id);
        if (!entry) return;

        const currentParts = this.getUnlockedCount(id);
        const maxParts = entry.text.length;

        if (currentParts < maxParts) {
            $gameSystem._codexProgress[id] = currentParts + 1;
            const readIndex = $gameSystem._codexRead.indexOf(id);
            if (readIndex > -1) $gameSystem._codexRead.splice(readIndex, 1);
            if (!$gameSystem._codexUnlocked.includes(id)) $gameSystem._codexUnlocked.push(id);

            if (SceneManager._scene instanceof Scene_Map) {
                const label = currentParts === 0 ? "CODEX UNLOCKED" : "CODEX UPDATED";
                SceneManager._scene.enqueueCodexNotify(entry.title, label);
            }
        }
    };

    Codex.markRead = function(id) { 
        if (this.isUnlocked(id) && !this.isRead(id)) $gameSystem._codexRead.push(id);
    };
    Codex.hasUnreadInCategory = function(cat) {
        return this.Database.some(e => e.category === cat && this.isUnlocked(e.id) && !this.isRead(e.id));
    };
    Codex.hasAnyUnread = function() {
        return this.Database.some(e => this.isUnlocked(e.id) && !this.isRead(e.id));
    };

    //-----------------------------------------------------------------------------//
    // 🔹 MAP NOTIFICATION WINDOW (Kept original logic)
    //-----------------------------------------------------------------------------//
    function Window_CodexNotify() { this.initialize.apply(this, arguments); }
    Window_CodexNotify.prototype = Object.create(Window_Base.prototype);
    Window_CodexNotify.prototype.constructor = Window_CodexNotify;

    Window_CodexNotify.prototype.initialize = function() {
        Window_Base.prototype.initialize.call(this, 20, 20, 400, 110);
        this.opacity = 0; 
        this.contentsOpacity = 0;
        this._showCount = 0;
        this._queue = [];
    };

    Window_CodexNotify.prototype.addEntry = function(title, label) {
        this._queue.push({title: title, label: label});
    };

    Window_CodexNotify.prototype.setupNext = function() {
        if (this._queue.length === 0) return;
        const data = this._queue.shift();
        this.contents.clear();
        
        this.contents.paintOpacity = 200;
        this.contents.fillRect(0, 0, this.contentsWidth(), this.contentsHeight(), "#000000");
        this.contents.paintOpacity = 255;
        
        this.changeTextColor(this.systemColor());
        this.contents.fontSize = 16;
        this.drawText(data.label, 15, 10, 370);
        
        this.resetTextColor();
        this.contents.fontBold = true;
        this.contents.fontSize = 24;
        this.drawText(data.title, 15, 45, 370);
        this.contents.fontBold = false;
        
        this._showCount = 180;
        this.contentsOpacity = 255;
    };

    Window_CodexNotify.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._showCount <= 0 && this._queue.length > 0) this.setupNext();
        if (this._showCount > 0) {
            this._showCount--;
            if (this._showCount > 150) {
                this.opacity = 0;
                this.contentsOpacity = Math.min(this.contentsOpacity + 20, 255);
            }
            if (this._showCount <= 30) {
                this.contentsOpacity = Math.max(this.contentsOpacity - 10, 0);
            }
        }
    };

    Scene_Map.prototype.enqueueCodexNotify = function(title, label) {
        if (!this._codexNotifyWindow) return;
        this._codexNotifyWindow.addEntry(title, label);
    };

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        this._codexNotifyWindow = new Window_CodexNotify();
        this.addChild(this._codexNotifyWindow);
    };

    //-----------------------------------------------------------------------------//
    // 🔹 MAIN MENU INTEGRATION
    //-----------------------------------------------------------------------------//
    const _Window_MenuCommand_drawItem = Window_MenuCommand.prototype.drawItem;
    Window_MenuCommand.prototype.drawItem = function(index) {
        _Window_MenuCommand_drawItem.call(this, index);
        if (this.commandSymbol(index) === 'codex' && Codex.hasAnyUnread()) {
            const rect = this.itemRectForText(index);
            this.changeTextColor("#00FFCC");
            const oldSize = this.contents.fontSize;
            this.contents.fontSize = 14;
            this.drawText("NEW", rect.x, rect.y - 12, rect.width, 'right');
            this.contents.fontSize = oldSize;
            this.resetTextColor();
        }
    };

    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function() {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand("Codex", "codex", true);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("codex", () => SceneManager.push(Scene_Codex));
    };

	//-----------------------------------------------------------------------------//
    // 🔹 WINDOW_CODEXCATEGORY (Panel 1 - Ghosting Fixes)
    //-----------------------------------------------------------------------------//
    function Window_CodexCategory() { this.initialize.apply(this, arguments); }
    Window_CodexCategory.prototype = Object.create(Window_Selectable.prototype);
    Window_CodexCategory.prototype.constructor = Window_CodexCategory;

    Window_CodexCategory.prototype.initialize = function() {
        this._data = ["History","Verse","Characters","Factions","Bestiary","Artifacts","Geography","Glossary"];
        Window_Selectable.prototype.initialize.call(this, 0, 0, 300, Graphics.boxHeight);
        this.refresh();
    };
    Window_CodexCategory.prototype.maxItems = function() { return this._data.length; };

    Window_CodexCategory.prototype.itemRect = function(index) {
        const rect = Window_Selectable.prototype.itemRect.call(this, index);
        const headerSpace = this.lineHeight() * 2; 
        const totalContentHeight = (this.maxItems() * this.itemHeight());
        const availableHeight = this.contentsHeight() - headerSpace;
        // Math.floor prevents subpixel blurring which causes text ghosts!
        const offsetY = Math.floor(Math.max(0, (availableHeight - totalContentHeight) / 2));
        rect.y += headerSpace + offsetY;
        return rect;
    };

    // The Ultimate Ghost-Killer: Clears the full width of the canvas, ignoring panel size changes
    Window_CodexCategory.prototype.clearItem = function(index) {
        const rect = this.itemRect(index);
        this.contents.clearRect(0, rect.y, this.contents.width, rect.height);
    };

    Window_CodexCategory.prototype.refresh = function() {
        Window_Selectable.prototype.refresh.call(this);
        this.changeTextColor("#FFD700");
        this.contents.fontBold = true;
        this.drawText("BOOKS", 0, 10, this.contentsWidth(), 'center');
        this.contents.fontBold = false;
        this.contents.fillRect(0, this.lineHeight() + 5, this.contentsWidth(), 2, "rgba(255,255,255,0.5)");
    };

	Window_CodexCategory.prototype.drawItem = function(index) {
        const rect = this.itemRectForText(index);
        const catName = this._data[index];
        
        // Map each category to a specific Icon Index from your IconSet.png
        let iconIndex = 0;
        switch(catName) {
            case "History":    iconIndex = 189; break; // Example: Scroll/Book icon
            case "Verse":      iconIndex = 80; break; // Example: Magic/Spark icon
            case "Characters": iconIndex = 82;  break; // Example: Person/Face icon
            case "Factions":   iconIndex = 191; break; // Example: Shield/Banner icon
            case "Bestiary":   iconIndex = 298; break; // Example: Monster claw/skull icon
            case "Artifacts":  iconIndex = 194; break; // Example: Ring/Relic icon
            case "Geography":  iconIndex = 196; break; // Example: Question mark/Book icon
			case "Glossary":   iconIndex = 190; break; // Example: Question mark/Book icon
        }

        // Draw the Icon next to the text
        this.drawIcon(iconIndex, rect.x + 10, rect.y + 2);

        this.changeTextColor(this.index() === index ? "#FFD700" : "#FFFFFF");
        // Offset text slightly to the right to make room for the 32x32 icon
        this.drawText(catName, rect.x + 45, rect.y, rect.width - 45); 
        
        if (Codex.hasUnreadInCategory(catName)) {
            this.changeTextColor("#00FFCC");
            this.contents.fontSize = 16;
            this.drawText("NEW", rect.x, rect.y, rect.width - 10, 'right');
            this.contents.fontSize = this.standardFontSize();
        }
    };

    Window_CodexCategory.prototype.select = function(index) {
        Window_Selectable.prototype.select.call(this, index);
        if (SceneManager._scene._listWindow) SceneManager._scene._listWindow.setCategory(this._data[index]);
    };

    //-----------------------------------------------------------------------------//
    // 🔹 WINDOW_CODEXLIST (Panel 2)
    //-----------------------------------------------------------------------------//
    function Window_CodexList() { this.initialize.apply(this, arguments); }
    Window_CodexList.prototype = Object.create(Window_Selectable.prototype);
    Window_CodexList.prototype.constructor = Window_CodexList;

    Window_CodexList.prototype.initialize = function() {
        this._data = [];
        Window_Selectable.prototype.initialize.call(this, 0, 0, 300, Graphics.boxHeight);
    };

    Window_CodexList.prototype.itemRect = function(index) {
        const rect = Window_Selectable.prototype.itemRect.call(this, index);
        rect.y += this.lineHeight() * 2; // Make room for header
        return rect;
    };

    Window_CodexList.prototype.refresh = function() {
        Window_Selectable.prototype.refresh.call(this);
        this.changeTextColor("#FFD700");
        this.contents.fontBold = true;
        this.drawText("CHAPTERS", 0, 10, this.contentsWidth(), 'center');
        this.contents.fontBold = false;
        this.contents.fillRect(0, this.lineHeight() + 5, this.contentsWidth(), 2, "rgba(255,255,255,0.5)");
    };

    Window_CodexList.prototype.setCategory = function(cat) {
        this._category = cat;
        this._data = Codex.Database.filter(e => e.category === cat);
        this.refresh();
        this.select(0);
    };
    Window_CodexList.prototype.maxItems = function() { return this._data.length; };
    
    Window_CodexList.prototype.drawItem = function(index) {
        const entry = this._data[index];
        if (!entry) return;
        const rect = this.itemRectForText(index);
        const unlocked = Codex.isUnlocked(entry.id);
        this.contents.fontBold = unlocked && !Codex.isRead(entry.id); 
        this.changeTextColor(this.index() === index ? "#FFD700" : (unlocked ? "#FFFFFF" : "#666666"));
        this.drawText(unlocked ? entry.title : "?????", rect.x, rect.y, rect.width);
        this.contents.fontBold = false;
    };

    Window_CodexList.prototype.select = function(index) {
        Window_Selectable.prototype.select.call(this, index);
        if (SceneManager._scene._detailWindow) SceneManager._scene._detailWindow.setEntry(this._data[index]);
    };
	
	// The Ultimate Ghost-Killer (Panel 2)
    Window_CodexList.prototype.clearItem = function(index) {
        const rect = this.itemRect(index);
        // Clears the entire horizontal line across the internal bitmap
        this.contents.clearRect(0, rect.y, this.contents.width, rect.height);
    };

	//-----------------------------------------------------------------------------//
    // 🔹 WINDOW_CODEXDETAIL (Dynamic Preview WordWrap Fix)
    //-----------------------------------------------------------------------------//
    function Window_CodexDetail() { this.initialize.apply(this, arguments); }
    Window_CodexDetail.prototype = Object.create(Window_Selectable.prototype);
    Window_CodexDetail.prototype.constructor = Window_CodexDetail;

    Window_CodexDetail.prototype.initialize = function() {
        Window_Selectable.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, Graphics.boxHeight);
        this._entry = null;
        this._maxScrollY = 0;
        this._scrollY = 0;
        this._isExpanded = false; // Tracks if we are in Preview or Full mode
        this.deselect();
    };

    Window_CodexDetail.prototype.createContents = function() {
        this.contents = new Bitmap(Graphics.boxWidth, 2500); 
    };

    // Triggered when entering or leaving Panel 3
    Window_CodexDetail.prototype.setExpanded = function(isExpanded) {
        if (this._isExpanded !== isExpanded) {
            this._isExpanded = isExpanded;
            this.refresh(); // Only re-wraps the text exactly ONCE per state change
        }
    };

    Window_CodexDetail.prototype.setEntry = function(entry) {
        if (this._entry === entry) return;
        this._entry = entry;
        this._scrollY = 0;
        this.origin.y = 0;
        this.refresh(); // Wraps text for Preview mode when hovering in Panel 2
        
        if (entry && Codex.isUnlocked(entry.id) && !Codex.isRead(entry.id)) {
            Codex.markRead(entry.id);
            if (SceneManager._scene._categoryWindow) SceneManager._scene._categoryWindow.refresh();
            if (SceneManager._scene._listWindow) SceneManager._scene._listWindow.refresh();
        }
    };

    // Dynamically calculates width based on whether Panel 3 is active or not
    Window_CodexDetail.prototype.getWrapWidth = function() {
        const screenW = Graphics.boxWidth;
        let targetX;
        
        if (this._isExpanded) {
            // Target X when Panel 3 is fully open
            targetX = (screenW * 0.15 - 15) + (screenW * 0.22) - 15;
        } else {
            // Target X when Panel 2 is active (Preview Mode)
            targetX = (screenW * 0.18 - 15) + (screenW * 0.28) - 15;
        }
        
        const activeWidth = screenW - targetX;
        return activeWidth - 56; // Subtract padding so text doesn't hit the absolute edge
    };

    Window_CodexDetail.prototype.drawLoreText = function(text, y) {
        const paragraphs = text.split('\n'); 
        const wrapWidth = this.getWrapWidth(); // Pulls the dynamic width
        let currentY = y;

        for (let p = 0; p < paragraphs.length; p++) {
            const words = paragraphs[p].split(" ");
            let line = "";
            
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + " ";
                if (this.textWidth(testLine) > wrapWidth && n > 0) {
                    this.drawText(line, 20, currentY, wrapWidth); 
                    line = words[n] + " ";
                    currentY += this.lineHeight();
                } else { 
                    line = testLine; 
                }
            }
            this.drawText(line, 20, currentY, wrapWidth);
            currentY += this.lineHeight(); 
        }
        
        this._maxScrollY = Math.max(0, currentY - this.height + 60);
    };

    Window_CodexDetail.prototype.refresh = function() {
        this.contents.clear();
        this.contents.paintOpacity = 255;
        this.contents.fillRect(0, 0, this.contents.width, this.contents.height, "#141423");

        const safeWidth = this.getWrapWidth();

        this.changeTextColor("#FFD700");
        this.contents.fontBold = true;
        this.drawText("CONTENT", 0, 10, safeWidth, 'center');
        this.contents.fontBold = false;
        
        if (!this._entry || !Codex.isUnlocked(this._entry.id)) {
            this.changeTextColor("#666666");
            this.drawText("Entry Locked", 0, 150, safeWidth, 'center');
            return;
        }

        this.changeTextColor("#FFFFFF");
        this.drawText(this._entry.title, 20, this.lineHeight() * 2, safeWidth);
        this.contents.fillRect(20, this.lineHeight() * 3, safeWidth, 2, "rgba(255,255,255,0.5)");
        
        const unlockedCount = Codex.getUnlockedCount(this._entry.id);
        const rawText = this._entry.text.slice(0, unlockedCount).join("\n\n"); 
        
        this.drawLoreText(rawText, this.lineHeight() * 4);
    };

    Window_CodexDetail.prototype.update = function() {
        Window_Selectable.prototype.update.call(this);
        
        if (this.active && this._maxScrollY > 0) {
            if (Input.isPressed("down")) this._scrollY = Math.min(this._scrollY + 5, this._maxScrollY); 
            if (Input.isPressed("up")) this._scrollY = Math.max(this._scrollY - 5, 0); 
            this.origin.y = this._scrollY; 
        }
        
        // Native MV Arrow will show up during Preview mode if text is cut off!
        this.downArrowVisible = (this._maxScrollY > 0 && this._scrollY < this._maxScrollY);
        this.upArrowVisible = (this._scrollY > 0);
    };

    //-----------------------------------------------------------------------------//
    // 🔹 SCENE CODEX (Layering & Optimized Sliding)
    //-----------------------------------------------------------------------------//
    function Scene_Codex() { this.initialize.apply(this, arguments); }
    Scene_Codex.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Codex.prototype.constructor = Scene_Codex;

    Scene_Codex.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        
        this._categoryWindow = new Window_CodexCategory();
        this._categoryWindow.setHandler("ok", () => this._listWindow.activate());
        this._categoryWindow.setHandler("cancel", this.popScene.bind(this));
        this.addChild(this._categoryWindow);

        this._listWindow = new Window_CodexList();
        
        // TRIGGER EXPANDED MODE: When player clicks into Panel 3
        this._listWindow.setHandler("ok", () => { 
            if (this._listWindow.maxItems() > 0) {
                this._detailWindow.setExpanded(true); 
                this._detailWindow.activate(); 
            }
        });
        
        this._listWindow.setHandler("cancel", () => { 
            this._listWindow.deselect(); 
            this._categoryWindow.activate(); 
        });
        this.addChild(this._listWindow);

        this._detailWindow = new Window_CodexDetail();
        this._detailWindow.width = Graphics.boxWidth * 0.70; 
        
        // TRIGGER PREVIEW MODE: When player backs out to Panel 2
        this._detailWindow.setHandler("cancel", () => { 
            this._detailWindow.active = false; 
            this._detailWindow.deselect(); 
            this._detailWindow.setExpanded(false); 
            this._listWindow.activate(); 
        });
        this.addChild(this._detailWindow);
        
        this._categoryWindow.activate();
        this._categoryWindow.select(0);
    };

Scene_Codex.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        const speed = 0.2; 
        const screenW = Graphics.boxWidth;
        let catW, listW;

        if (this._detailWindow.active) {
            catW = screenW * 0.15; listW = screenW * 0.22;
        } else if (this._listWindow.active) {
            catW = screenW * 0.18; listW = screenW * 0.28;
        } else {
            catW = screenW * 0.22; listW = screenW * 0.22; 
        }

        this._categoryWindow.width += (catW - this._categoryWindow.width) * speed;
        this._listWindow.width += (listW - this._listWindow.width) * speed;
        
        // Panel 2 overlaps Panel 1
        this._listWindow.x = this._categoryWindow.width - 15; 
        
        // Panel 3 overlaps Panel 2
        const targetDetailX = this._listWindow.x + this._listWindow.width - 15;
        this._detailWindow.x += (targetDetailX - this._detailWindow.x) * speed;

        // THE ANCHOR FIX: Panel 3's right edge ALWAYS stops perfectly at the screen edge!
        this._detailWindow.width = screenW - this._detailWindow.x;

        if (this._categoryWindow.active) this._categoryWindow.updateCursor();
        if (this._listWindow.active) this._listWindow.updateCursor();
    };
	
	//-----------------------------------------------------------------------------//
    // 🔹 BATTLE NOTIFICATIONS & SCAN INTEGRATION
    //-----------------------------------------------------------------------------//
    
    // Create the notify window in Battle just like on the Map
    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        this._codexNotifyWindow = new Window_CodexNotify();
        this.addChild(this._codexNotifyWindow);
    };

    Scene_Battle.prototype.enqueueCodexNotify = function(title, label) {
        if (this._codexNotifyWindow) this._codexNotifyWindow.addEntry(title, label);
    };

    // The JSON Parser for the Scan Skill
    Codex.unlockByScan = function(enemyId) {
        const entry = this.Database.find(e => {
            if (!e.scan) return false;
            const parts = e.scan.split('_');
            return Number(parts[0]) === enemyId;
        });

        if (!entry) return; // No lore for this enemy

        const parts = entry.scan.split('_');
        const targetParts = Number(parts[1] || 0);
        const currentParts = this.getUnlockedCount(entry.id);
        const maxParts = entry.text.length;
        
        // If 0, unlock the whole thing. Otherwise, unlock the targeted amount.
        const unlockLimit = targetParts === 0 ? maxParts : Math.min(targetParts, maxParts);

        if (currentParts < unlockLimit) {
            $gameSystem._codexProgress[entry.id] = unlockLimit;
            
            const readIndex = $gameSystem._codexRead.indexOf(entry.id);
            if (readIndex > -1) $gameSystem._codexRead.splice(readIndex, 1);
            if (!$gameSystem._codexUnlocked.includes(entry.id)) $gameSystem._codexUnlocked.push(entry.id);

            if (SceneManager._scene instanceof Scene_Battle) {
                const label = currentParts === 0 ? "BESTIARY UNLOCKED" : "BESTIARY UPDATED";
                SceneManager._scene.enqueueCodexNotify(entry.title, label);
            }
        }
    };

    // Initialize the Scanned state on all enemies
    const _Game_Enemy_initMembers = Game_Enemy.prototype.initMembers;
    Game_Enemy.prototype.initMembers = function() {
        _Game_Enemy_initMembers.call(this);
        this._isScanned = false;
    };

    // Hook into skill execution: Just add <Scan> to your skill's notebox!
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        
        if (this.item() && this.item().meta.Scan) {
            target._isScanned = true;
            if (target.isEnemy()) {
                Codex.unlockByScan(target.enemyId());
            }
        }
    };

})();