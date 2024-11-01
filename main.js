// =============================================================================
// = attribution
// =   elhelper: is MIT licensed, (c) 2022 amgg
// =   webfishing game code is all originally by lamedeveloper,
// =    sections of which have been reverse engineered and re-implemented here
// =    without any approval or permission.          you wouldn't download a car
// =============================================================================

(async () => {

// =============================================================================
// = libraries
// =============================================================================
const elhelper = (function() { /* via https://github.com/adrianmgg/elhelper, MIT licensed */
	function setup(elem, { style: { vars: styleVars = {}, ...style } = {}, attrs = {}, dataset = {}, events = {}, classList = [], children = [], parent = null, insertBefore = null, ...props }) {
		for (const k in style) elem.style[k] = style[k];
		for (const k in styleVars) elem.style.setProperty(k, styleVars[k]);
		for (const k in attrs) elem.setAttribute(k, attrs[k]);
		for (const k in dataset) elem.dataset[k] = dataset[k];
		for (const k in events) elem.addEventListener(k, events[k]);
		for (const c of classList) elem.classList.add(c);
		for (const k in props) elem[k] = props[k];
		for (const c of children) elem.appendChild(c);
		if (parent !== null) {
			if (insertBefore !== null) parent.insertBefore(elem, insertBefore);
			else parent.appendChild(elem);
		}
		return elem;
	}
	function create(tagName, options = {}) { return setup(document.createElement(tagName), options); }
	function createNS(namespace, tagName, options = {}) { return setup(document.createElementNS(namespace, tagName), options); }
	return {setup, create, createNS};
})();
// =============================================================================

// =============================================================================
// = reimplemented chunks of webfishing
// =============================================================================
const wf_data = await fetch('webfishing_data_dump.json').then(r => r.json());
const godot = {}; // godot api function reimpls
godot.rand_range = function(min, max) { return Math.random() * (max - min) + min; };
godot.randf = function() { return Math.random(); };
godot.clamp = function(value, min, max) { return Math.min(max, Math.max(min, value)); }
// via https://gist.github.com/RHavar/a6511dea4d4c41aeb1eb and https://gist.github.com/RHavar/a6511dea4d4c41aeb1eb?permalink_comment_id=2810332#gistcomment-2810332
godot.randi = function() {
	// TODO wait this should probably be done once rather than every call
	if (window && window.crypto && window.crypto.getRandomValues && Uint32Array) {
		return window.crypto.getRandomValues(new Uint32Array(1))[0];
	}
	return (Math.random()*4294967296)>>>0;
};
// via https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform#JavaScript and https://rosettacode.org/wiki/Statistics/Normal_distribution#Lua
godot.randfn = function(mean, deviation) {
	return Math.sqrt(-2 * deviation * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()) + mean;
};
// via https://github.com/godotengine/godot/blob/c6c464cf9ae56e8b68620af65125dd980d0e8122/core/math/math_funcs.cpp#L120-L125
godot.stepify = function(s, step) {
	if(step != 0) { s = Math.floor(s / step + 0.5) * step; }
	return s;
};
const wf = {};
wf._roll_loot_table = function(table, max_tier=-1) {
	if(!(table in wf_data.loot_tables)) return;
	// (rng reseeded here)
	for(let i = 0; i < 20; i++) {
		const roll = godot.rand_range(0.0, wf_data.loot_tables[table]["total"]);
		for(const item in wf_data.loot_tables[table]["entries"]) {
			// const item = wf_data.loot_tables[table]["entries"][item_k];
			if(wf_data.loot_tables[table]["entries"][item] > roll) {
				const data = wf_data.item_data[item]["file"];
				if((max_tier == - 1) || (data.tier <= max_tier)) {
					return item;
				}
			}
		}
	}
	return null;
};
wf._roll_item_size = function(item) {
	if(!(item in wf_data.item_data)) { return null; } 
	let base = wf_data.item_data[item]["file"].average_size;
	let deviation = base * 0.55;
	base += base * 0.25;

	let roll = godot.stepify(godot.randfn(base, deviation), 0.01);
	roll = Math.max(Math.abs(roll), 0.01);
	return roll;
};
wf._get_item_worth = function(item, type = "money") {
	let size_prefix = [
		[0.1, 1.75], 
		[0.2, 0.6], 
		[0.5, 0.8], 
		[1.0, 1.0], 
		[1.5, 1.5], 
		[2.0, 2.5], 
		[3.0, 4.25], 
	];
	let average = wf_data.item_data[item.id].file.average_size;
	let calc = item.size / average;
	let mult = 1.0;
	for(const [p, pm] of size_prefix) {
		if(p > calc) { break; }
		mult = pm;
	}
	let idata = wf_data.item_data[item["id"]]["file"];
	let value = idata.sell_value;
	if(idata.generate_worth) {
		let t = 1.0 + (0.25 * idata.tier);
		let w = idata.loot_weight;
		value = Math.pow(5 * t, 2.5 - w);
		if(w < 0.4) { value *= 1.1; }
		if(w < 0.15) { value *= 1.25; }
		if(w < 0.05) { value *= 1.5; }
	}
	let worth = Math.ceil(value * mult * wf_data.PlayerData.QUALITY_DATA[item["quality"]].worth);
	if(type == "credits" && item["fresh"] == false) { worth = 0; }
	return worth;
};
wf.simulate_fishing = function({
	casted_bait,
	zone_chance_boost = 0.0,
	junk_mult = 1.0, // comes from the zone
	fish_type = 'ocean', // comes from the zone
	in_rain = false, // raining?
	lure_selected = '',
	rod_luck_level = 0, // variable on PlayerData, stored in save as rod_luck
	rod_power_level = 0,
	rod_speed_level = 0,
	rod_chance_level = 0,
} = {}) {
	let failed_casts = 0.0;  // fishing logic variable
	let elapsed = 0.0;  // our tracking for seconds elapsed
	let bait_used = 0;  // our tracking for # bait consumed
	let inv_items_added = []; // our tracking for items that will be added to inventory. analagous to PlayerData._add_item() calls
	let gold_added = 0; // our tracking for amount bonus money gained (from lucky lure / catcher's luck)
	
	// =============================
	// ==== _cast_fishing_rod() ====
	// =============================

	let rod_cast_data = wf_data.PlayerData.LURE_DATA[lure_selected].effect_id;
	// ... animation stuff ...
	// ... out of bait warning stuff ...
	
	let rod_damage = [1, 3, 10, 20, 35, 50][rod_power_level];
	let rod_spd = [0.0, 0.1, 0.24, 0.4, 0.7, 1.0][rod_speed_level];
	let rod_chance = [0.0, 0.02, 0.04, 0.06, 0.08, 0.1][rod_chance_level];
	
	// ... game state/animation/audio stuff ...
	// ... checks whether cast spot is valid ...
	
	// rod_depth = 0
	
	// casted_bait = PlayerData.bait_selected
	// if casted_bait != "" and PlayerData.bait_inv[casted_bait] <= 0: casted_bait = ""
	
	// ... animation stuff ...
	// ^ TODO for elapsed time calc, should factor in this duration too
	
	// ========================================
	// ==== _on_fish_catch_timer_timeout() ====
	// ========================================

	// timer loop
	timer_loop: for(;;) {
		elapsed += godot.rand_range(2.0, 3.0);  // fish_timer.wait_time = rand_range(2.0, 3.0)
		let fish_chance = 0.0;
		let base_chance = wf_data.BAIT_DATA[casted_bait].catch;
		fish_chance = base_chance;
		fish_chance += (base_chance * failed_casts);
		fish_chance += (base_chance * rod_chance);
		fish_chance += zone_chance_boost * fish_chance;
		// TODO: if(recent_reel > 0) {fish_chance *= 1.1; }
		if(rod_cast_data == "attractive") { fish_chance *= 1.3; }
		if(in_rain) { fish_chance *= 1.1; }
		// TODO: fish_chance *= catch_drink_boost;
		// ... out of bait warning message handling, not needed here ...
		if(godot.randf() > fish_chance) {
			failed_casts += 0.05;
		} else {
			break timer_loop;
		}
	}

	// bait usage
	let bait_use_chance = 1.0;
	if(rod_cast_data == "efficient") { bait_use_chance = 0.8; }
	if(godot.randf() < bait_use_chance) { bait_used += 1; }  // TODO double check no other logic in `PlayerData._use_bait(casted_bait)`
	let max_tier = wf_data.BAIT_DATA[casted_bait]["max_tier"];
	let double_bait = 0.0;
	if(["large", "sparkling", "double"].includes(rod_cast_data)) { double_bait = 0.25; }
	if(godot.randf() < double_bait) { bait_used += 1; }
	if(rod_cast_data == "gold") { bait_used += 2; }

	let treasure_mult = 1.0;
	if(rod_cast_data == "magnet") { treasure_mult = 2.0; }
	if(rod_cast_data == "salty") { fish_type = "ocean"; }
	if(rod_cast_data == "fresh") { fish_type = "lake"; }
	
	let force_av_size = false;
	
	if(godot.randf() < 0.05 * treasure_mult * junk_mult) {
		fish_type = "water_trash";
		max_tier = 0;
		force_av_size = true;
	}
	
	if(in_rain && (godot.randf() < 0.08)) { fish_type = "rain"; }
	
	let rolls = [];
	for(let i = 0; i < 3; i++) {
		let roll = wf._roll_loot_table(fish_type, max_tier);
		// TODO how *does* the game actually handle the case where nothing is rolled after 20 internal tries?
		if(roll === null) return null;
		let s = wf._roll_item_size(roll);
		if(s === null) return null;
		rolls.push([roll, s]);
	}
	
	let reroll_type = "none";
	if(rod_cast_data == "small") { reroll_type = "small"; }
	if(rod_cast_data == "sparkling") { reroll_type = "tier"; }
	if(rod_cast_data == "large") { reroll_type = "large"; }
	if(rod_cast_data == "gold") { reroll_type = "rare"; }
	
	let chosen = rolls[0];
	for(const roll of rolls) {
		if(reroll_type == "none") { chosen = roll; }
		else if(reroll_type == "small") {
			if(roll[1] < chosen[1]) { chosen = roll; }
		}
		else if(reroll_type == "large") {
			if(roll[1] > chosen[1]) { chosen = roll; }
		}
		else if(reroll_type == "tier") {
			let old_tier = wf_data.item_data[chosen[0]]["file"].tier;
			let new_tier = wf_data.item_data[roll[0]]["file"].tier;
			if(new_tier > old_tier) { chosen = roll; }
		}
		else if(reroll_type == "rare") {
			let new_rare = wf_data.item_data[roll[0]]["file"].rare;
			if(new_rare) { chosen = roll; }
		}
	}
	
	let fish_roll = chosen[0];
	let size = chosen[1];
	
	let quality = wf_data.PlayerData.ITEM_QUALITIES.NORMAL;
	let r = godot.randf();
	for(const q of Object.values(wf_data.PlayerData.ITEM_QUALITIES)) {
		if(wf_data.BAIT_DATA[casted_bait]["quality"].length - 1 < q) {
			break; // bait does not support rarity
		}
		if(godot.randf() < wf_data.BAIT_DATA[casted_bait]["quality"][q]) {
			quality = q;
		}
	}
	
	if(godot.randf() < 0.02 * treasure_mult) {
		fish_roll = "treasure_chest";
		size = 60.0;
		quality = 0;
	}
	
	let data = wf_data.item_data[fish_roll]["file"];
	let quality_data = wf_data.PlayerData.QUALITY_DATA[quality];
	
	if(force_av_size) { size = data.average_size; }
	
	let diff_mult = godot.clamp(size / data.average_size, 0.7, 1.8);
	let difficulty = godot.clamp((data.catch_difficulty * diff_mult * quality_data.diff) + quality_data.bdiff, 1.0, 250.0);
	
	let xp_mult = size / data.average_size;
	if (xp_mult < 0.15) {xp_mult = 1.25 + xp_mult;}
	xp_mult = Math.max(0.5, xp_mult);
	// TODO catch_drink_xp
	let xp_add = Math.ceil(data.obtain_xp * xp_mult * /*catch_drink_xp*/1.0 * quality_data.worth);
	
	// ... fishing struggle minigame happens here ...
	// TODO need to factor in the catch struggle duration into total duration here
	// (we assume player succeeds 100% of catches)
	
	let catches = 1;
	if(rod_cast_data == "double" && godot.randf() < 0.15) { catches = 2; }
	
	if(rod_luck_level > 0 && godot.randf() < 0.15) {
		inv_items_added.push({"id": "luck_moneybag", "size": godot.randi() % 15 + 15, "quality": rod_luck_level, "tags": []});
	}
	
	let tags = [];
	let ref__catch;
	for(let i = 0; i < catches; i++) {
		inv_items_added.push(ref__catch = {id: fish_roll, size: size, quality: quality, tags: tags});
		// TODO: `xp_buildup += xp_add`
	}
	
	if(rod_cast_data == "lucky") {
		let worth = wf._get_item_worth(ref__catch);
		let gold = Math.max(1, Math.ceil(worth * godot.rand_range(0.01, 0.1)));
		gold_added += gold;
	}
	// TODO ... simulate catcher's luck ...
	
	return { elapsed, bait_used, inv_items_added, gold_added };
};
// =============================================================================

// DOM helpers
function mktable(objects, keys) {
	return elhelper.create('table', {
		children: [
			elhelper.create('thead', {
				children: [elhelper.create('tr', {
					children: keys.map(k => elhelper.create('th', { textContent: k, })),
				})],
			}),
			elhelper.create('tbody', {
				children: objects.map(o => elhelper.create('tr', {
					children: keys.map(k => elhelper.create('td', { textContent: o[k], })),
				})),
			}),
		],
	});
}
function mk_spoiler_collapse(title, el) {
	return elhelper.create('details', {
		children: [
			elhelper.create('summary', { textContent: title }),
			el,
		],
	});
}
function mk_section(title, el) {
	return elhelper.setup(mk_spoiler_collapse(title, el), { classList: ['wf-uielem'] });
}
function mk_form_dropdown(...choices) {
	return elhelper.create('select', {
		children: choices.map((choice) => {
			let [label, value] = Array.isArray(choice) ? choice : [choice, choice];
			return elhelper.create('option', { value, textContent: label });
		}),
	});
}
function mk_labeled(label, el) {
	return elhelper.create('label', { textContent: label, children: [el], });
}

// =============================================================================
// = simulator ui
// =============================================================================
const simulator_el = (() => {
	const container = elhelper.create('div');
	const form = elhelper.create('form', { parent: container });
	const report_container = elhelper.create('div', { parent: container });
	const f_bait = mk_form_dropdown('worms', 'cricket', 'leech', 'minnow', 'squid', 'nautilus');
	const f_lure = mk_form_dropdown(...Object.entries(wf_data.PlayerData.LURE_DATA).map( ([id, {name}]) => [name, id] ));
	const f_rodpower = mk_form_dropdown(...[1, 3, 10, 20, 35, 50].map((n,idx) => [n,idx]));
	const f_rodspeed = mk_form_dropdown(...[0, 1, 2, 3, 4, 5].map((n,idx) => [n,idx]));
	const f_rodchance = mk_form_dropdown(...[0, 1, 2, 3, 4, 5].map((n,idx) => [n,idx]));
	const f_rodluck = mk_form_dropdown(...[0, 1, 2, 3, 4, 5].map((n,idx) => [n,idx]));
	const f_maxbait = mk_form_dropdown(...[5, 10, 15, 20, 25, 30].map((n,idx) => [n,idx]));
	const f_fishtype = mk_form_dropdown('ocean', 'lake');
	const f_raining = elhelper.create('input', { type: 'checkbox', checked: false });
	const f_simsteps = elhelper.create('input', { type: 'number', min: 1, valueAsNumber: 8192 });
	let sim_args = {};
	function update_sim_args() {
		sim_args = {
			casted_bait: f_bait.value,
			rod_power_level: Number.parseInt(f_rodpower.value),
			rod_speed_level: Number.parseInt(f_rodspeed.value),
			rod_chance_level: Number.parseInt(f_rodchance.value),
			rod_luck_level: Number.parseInt(f_rodluck.value),
			fish_type: f_fishtype.value,
			in_rain: f_raining.checked,
			lure_selected: f_lure.value,
		};
	}
	function do_simulation() {
		// clear old report
		report_container.replaceChildren();
		// run simulation, capture stats
		const player_max_bait = [5, 10, 15, 20, 25, 30][f_maxbait.value];
		const steps = f_simsteps.valueAsNumber;
		let total_elapsed = 0;
		let total_bait = 0;
		const freqs = {}; // (fish -> (quality -> count))
		let total_income_fishsale = 0;
		let total_income_moneybags = 0;
		let total_income_bonus = 0;
		for(let step = 0; step < steps; step++) {
			// {"elapsed":9.454701500825825,"bait_used":1,"inv_items_added":[{"id":"fish_ocean_sunfish","size":231.92000000000002,"quality":0,"tags":[]}],"gold_added":0}
			const sim = wf.simulate_fishing(sim_args);
			if(sim === null) { step--; continue; }
			total_elapsed += sim.elapsed;
			total_bait += sim.bait_used;
			total_income_bonus += sim.gold_added;
			for(const item of sim.inv_items_added) {
				(freqs[item.id] ??= {})[item.quality] ??= 0;
				freqs[item.id][item.quality]++;
				const item_worth = wf._get_item_worth(item) ?? 0;
				if(item.id === 'luck_moneybag') { total_income_moneybags += item_worth; }
				else if(item.id === 'treasure_chest') { /* (not selling chests) */ }
				else { total_income_fishsale += item_worth; }
			}
		}
		// generate report
		const report_lines = [];
		let gold_per_bait = wf_data.PlayerData.BAIT_DATA[sim_args.casted_bait].cost / player_max_bait;
		let fish_per_second = steps / total_elapsed;
		let total_goldspent_bait = total_bait * gold_per_bait;
		let total_goldspent = total_goldspent_bait;
		let total_income = total_income_fishsale + total_income_moneybags + total_income_bonus;
		function fmt_pertime_hr(per_second) { return `${(per_second*60*60).toFixed(2)}/hr`; };
		function fmt_pertime_min(per_second) { return `${(per_second * 60).toFixed(2)}/min (${fmt_pertime_hr(per_second)})`; }
		report_lines.push(`avg. fish: ${fmt_pertime_min(fish_per_second)}`);
		report_lines.push(`profit: ${fmt_pertime_min((total_income - total_goldspent) / total_elapsed)}`);
		if(total_income_fishsale  != 0) { report_lines.push(`    + ${fmt_pertime_min(total_income_fishsale / total_elapsed)} selling catches`); }
		if(total_income_moneybags != 0) { report_lines.push(`    + ${fmt_pertime_min(total_income_moneybags / total_elapsed)} from luck coin bags`); }
		if(total_income_bonus     != 0) { report_lines.push(`    + ${fmt_pertime_min(total_income_bonus / total_elapsed)} bonus`); }
		if(total_goldspent        != 0) { report_lines.push(`    - ${fmt_pertime_min(total_goldspent / total_elapsed)} buying bait`); }
		if(sim_args.lure_selected === 'challenge_lure') { report_lines.push('WARNING: challenge lure profits not yet included in simulation'); };
		report_lines.push('WARNING: elapsed times are currently a slight under-estimate');
		if(sim_args.rod_speed_level !== 0) { report_lines.push('WARNING: time savings from higher rod reel speeds not yet considered in simulation'); }
		elhelper.create('pre', { parent: report_container, textContent: report_lines.join('\n') });
		elhelper.create('table', {
			parent: report_container,
			children: [
				elhelper.create('thead', { children: [
					elhelper.create('tr', { children: ['Fish', '(total)', 'Normal', 'Shining', 'Glistening', 'Opulent', 'Radiant', 'Alpha'].map(t => elhelper.create('th', { textContent: t })) }),
				]}),
				elhelper.create('tbody', {
					children: Object.keys(freqs).sort().map(fish_id => {
						const fish_freqs = freqs[fish_id];
						let overall_freq = 0;
						for(const quality in freqs[fish_id]) { overall_freq += freqs[fish_id][quality]; }
						return elhelper.create('tr', {
							children: [wf_data.item_data[fish_id].file.item_name, fmt_pertime_hr(overall_freq / total_elapsed), ...[0,1,2,3,4,5].map(quality => fmt_pertime_hr((fish_freqs[quality] ?? 0) / total_elapsed))].map(t => elhelper.create('td', { textContent: t })),
						});
					}),
				}),
			],
		});
	}
	elhelper.setup(form, {
		children: [
			mk_labeled('Bait', f_bait),
			mk_labeled('Lure', f_lure),
			mk_labeled('Rod Power', f_rodpower),
			mk_labeled('Rod Reel Speed', f_rodspeed),
			mk_labeled('Rod Catch Chance', f_rodchance),
			mk_labeled('Rod Luck', f_rodluck),
			mk_labeled('Max Bait', f_maxbait),
			mk_labeled('Zone Type', f_fishtype),
			mk_labeled('Raining?', f_raining),
			mk_labeled('Simulation Steps', f_simsteps),
			elhelper.create('input', { type: 'submit', value: 'Simulate' }),
		],
		events: {
			change: (ev) => { update_sim_args(); do_simulation(); },
			submit: (ev) => {
				update_sim_args();
				ev.preventDefault();
				do_simulation();
			},
		},
	});
	return container;
})();
// =============================================================================

elhelper.create('div', {
	parent: document.body,
	classList: ['detail-container'],
	children: [
		mk_section('items', mktable(Object.entries(wf_data.item_data).map(([k,v]) => ({id: k, ...v.file})), ['id', 'item_name', 'category', 'tier', 'rare', 'catch_difficulty', 'catch_speed', 'loot_table', 'average_size', 'sell_value', 'sell_multiplier'])),
		mk_section('cosmetics', mktable(Object.entries(wf_data.cosmetic_data).map(([k,v]) => ({id: k, ...v.file})), ['id', 'name', 'in_rotation', 'chest_reward', 'cost', 'title'])),
		mk_section('fishing calculator', simulator_el),
	],
});

})();
