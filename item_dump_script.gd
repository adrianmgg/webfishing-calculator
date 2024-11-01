extends SceneTree

func _get_singleton_by_name(name):
	for idx in range(root.get_child_count()):
		var n = root.get_child(idx)
		if n.name == name:
			return n
	return null

func _get_cli_userarg(argname):
	var in_userargs = false
	var got_arg = false
	for arg in OS.get_cmdline_args():
		if not in_userargs:
			if arg == "--":
				in_userargs = true
		else:
			if got_arg:
				return arg
			if arg.lstrip("--") == argname:
				got_arg = true
	return null

func _dump_json_to(data, dest):
	var json = JSON.print(data, "\t")
	var dump_file = File.new()
	dump_file.open(dest, File.WRITE)
	dump_file.store_string(json)
	dump_file.close()

func _preprocess_variant_for_json(data):
	match typeof(data):
		TYPE_ARRAY:
			var ret = []
			ret.resize(data.size())
			for idx in range(data.size()):
				ret[idx] = _preprocess_variant_for_json(data[idx])
			return ret
		TYPE_RAW_ARRAY, TYPE_INT_ARRAY, TYPE_REAL_ARRAY, TYPE_STRING_ARRAY, TYPE_VECTOR2_ARRAY, TYPE_VECTOR3_ARRAY, TYPE_COLOR_ARRAY:
			return _preprocess_variant_for_json(Array(data))
		TYPE_DICTIONARY:
			var ret = {}
			for k in data.keys():
				ret[_preprocess_variant_for_json(k)] = _preprocess_variant_for_json(data[k])
			return ret
		TYPE_OBJECT:
			if data is ItemResource or data is CosmeticResource:
				var script = data.get_script()
				var ret = {}
				for prop in script.get_script_property_list():
					if prop["name"] in [
						# exclude b/c/o runtime-only stuff (meshes, mats, etc.)
						"species_alt_mesh", "mesh", "icon", "item_scene", "scene_replace", "mesh_skin", "material", "secondary_material", "third_material", "alt_blink", "alt_eye", "body_pattern",
						# exclude b/c/o otherwise not relevant
						"mirror_face", "flip", "allow_blink", "main_color", # rendering/visuals specific stuff
						"action", "action_params", "release_action", # runtime item actions
						"detect_item", # true for metal detector, false for all others
						# probably: "show_item", "show_scene", "uses_size", "arm_value", "hold_offset", "unselectable"
					]:
						continue
					var prop_value = data.get(prop["name"])
					ret[prop["name"]] = _preprocess_variant_for_json(prop_value)
				return ret
			else:
				print("WARNING: UNHANDLED CLASS ", data.get_class())
				return data
		_:
			return data

func _init():
	print("hello init!")
	var globals = _get_singleton_by_name("Globals")
	var player_cls = load("res://Scenes/Entities/Player/player.gd")
	var playerdata = _get_singleton_by_name("PlayerData")
	var dump_data = _preprocess_variant_for_json({
		"item_data": globals.item_data,
		"cosmetic_data": globals.cosmetic_data,
		"loot_tables": globals.loot_tables,
		"BAIT_DATA": player_cls.BAIT_DATA,
		"PlayerData": {
			"ITEM_QUALITIES": playerdata.ITEM_QUALITIES,
			"QUALITY_DATA": playerdata.QUALITY_DATA,
			"LURE_DATA": playerdata.LURE_DATA,
			"BAIT_DATA": playerdata.BAIT_DATA,
		},
	})
	var dump_dest = _get_cli_userarg("dump-to")
	_dump_json_to(dump_data, dump_dest)
	quit()
