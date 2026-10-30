"""External layout import history survives edits and workflow serialization."""
import copy
import json
import unittest

from test_moss_layout import ML, MUG_TEXT, run, draft_of


class ExternalOnChangeTests(unittest.TestCase):
    def first(self, mode=None):
        result = run(external_layout_json=MUG_TEXT,
                     external_sync_mode=mode or ML.EXTERNAL_ON_CHANGE)
        return json.loads(result['ui']['synced_layout_data'][0])

    def execute(self, state, source=MUG_TEXT, **overrides):
        args = dict(layout_data=json.dumps(state), external_layout_json=source,
                    external_sync_mode=ML.EXTERNAL_ON_CHANGE,
                    width=state['base_width'], height=state['base_height'])
        args.update(overrides)
        return run(**args)

    def test_new_node_default_and_old_canvas_first_import(self):
        self.assertEqual(ML.VMMOSSLayoutStudio.INPUT_TYPES()['optional']['external_sync_mode'][1]['default'],
                         ML.EXTERNAL_ON_CHANGE)
        state = self.first()
        self.assertEqual(len(state['boxes']), 3)
        self.assertRegex(state['external_sync_signature'], r'^[0-9a-f]{64}$')

    def test_unchanged_preserves_edit_add_delete_visibility_and_palette(self):
        state = self.first()
        state['boxes'][0].update(cx=0.4, cy=0.4, caption='Edited caption', visible=False)
        state['boxes'][1].update(cx=0.5, w=0.2, text='Edited title', palette=['#112233'])
        state['boxes'].pop()
        new = copy.deepcopy(state['boxes'][1])
        new.update(id='local_new', text='Local title', cy=0.8)
        state['boxes'].append(new)
        state['palette'] = ['#abcdef']
        actual = self.execute(state, global_prompt='Local caption')
        expected = self.execute(state, external_sync_mode=ML.EXTERNAL_IGNORE, global_prompt='Local caption')
        self.assertEqual(actual['result'][:2], expected['result'][:2])
        self.assertNotIn('synced_layout_data', actual['ui'])
        self.assertNotIn('synced_caption', actual['ui'])

    def test_clear_all_stays_empty_and_does_not_restore_source_size(self):
        state = self.first()
        state['boxes'] = []
        out = self.execute(state, width=768, height=768, global_prompt='Empty edited canvas')
        self.assertEqual(draft_of(out)['items'], [])
        self.assertEqual(out['result'][3:], (768, 768))
        self.assertNotIn('synced_layout_data', out['ui'])

    def test_upstream_change_reimports_then_preserves_next_edit(self):
        state = self.first()
        state['boxes'][1]['text'] = 'Local edit'
        source = ML._json_object(ML.strip_fences(MUG_TEXT))
        source['items'][1]['text'] = 'Changed upstream'
        out = self.execute(state, json.dumps(source))
        updated = json.loads(out['ui']['synced_layout_data'][0])
        self.assertNotEqual(state['external_sync_signature'], updated['external_sync_signature'])
        self.assertEqual(updated['boxes'][1]['text'], 'Changed upstream')
        updated['boxes'][1]['text'] = 'Second local edit'
        again = self.execute(updated, json.dumps(source))
        self.assertNotIn('synced_layout_data', again['ui'])
        self.assertEqual(draft_of(again)['items'][1]['text'], 'Second local edit')

    def test_formatting_fences_and_key_order_do_not_reimport(self):
        state = self.first()
        source = ML._json_object(ML.strip_fences(MUG_TEXT))
        out = self.execute(state, '```json\n' + json.dumps(source, sort_keys=True, indent=4) + '\n```')
        self.assertNotIn('synced_layout_data', out['ui'])

    def test_workflow_roundtrip_keeps_signature_per_node(self):
        state = self.first()
        restored = ML.parse_layout_data(json.dumps(state), 1024, 1024)
        self.assertEqual(restored['external_sync_signature'], state['external_sync_signature'])
        self.assertNotIn('synced_layout_data', self.execute(restored)['ui'])
        self.assertIn('synced_layout_data', self.execute({'boxes': [], 'base_width': 1024,
                                                       'base_height': 1024})['ui'])

    def test_replace_merge_ignore_and_disconnect_keep_existing_contract(self):
        for mode in (ML.EXTERNAL_REPLACE, ML.EXTERNAL_MERGE):
            with self.subTest(mode=mode):
                state = self.first(mode)
                state['boxes'][1]['text'] = 'Edited'
                forced = self.execute(state, external_sync_mode=mode)
                self.assertNotEqual(draft_of(forced)['items'][1]['text'], 'Edited')
                self.assertNotIn('synced_layout_data', self.execute(state)['ui'])
        state = self.first()
        for source, mode in ((MUG_TEXT, ML.EXTERNAL_IGNORE), ('', ML.EXTERNAL_ON_CHANGE),
                             (None, ML.EXTERNAL_ON_CHANGE)):
            with self.subTest(source=source, mode=mode):
                self.assertNotIn('synced_layout_data', self.execute(state, source, external_sync_mode=mode)['ui'])

    def test_bad_source_does_not_advance_import_history(self):
        state = self.first()
        before = copy.deepcopy(state)
        out = self.execute(state, '{"foo": 1}')
        self.assertNotIn('synced_layout_data', out['ui'])
        self.assertEqual(state, before)
        self.assertNotIn('synced_layout_data', self.execute(state)['ui'])

    def test_caption_only_source_is_imported_once(self):
        out = self.execute({'boxes': [], 'base_width': 1024, 'base_height': 1024}, '{"caption":"Original"}')
        state = json.loads(out['ui']['synced_layout_data'][0])
        again = self.execute(state, '{"caption":"Original"}', global_prompt='Manual caption')
        self.assertEqual(again['result'][0], 'Manual caption')
        self.assertNotIn('synced_caption', again['ui'])

    def test_history_is_private_not_part_of_model_prompt_or_draft(self):
        out = run(external_layout_json=MUG_TEXT)
        for value in out['result'][:2]:
            self.assertNotIn('external_sync_signature', value)


if __name__ == '__main__':
    unittest.main()
