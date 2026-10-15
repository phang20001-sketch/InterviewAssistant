<script>
import { defineComponent, h } from 'vue';
import { markdownNodes } from './markdown.js';

export default defineComponent({
  name: 'MarkdownContent',
  props: {
    content: {
      type: String,
      default: '',
    },
    plainText: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    return () =>
      h(
        'div',
        {
          class: ['markdown-content', { 'screen-answer-content': props.plainText }],
        },
        props.plainText ? props.content : markdownNodes(props.content),
      );
  },
});
</script>
