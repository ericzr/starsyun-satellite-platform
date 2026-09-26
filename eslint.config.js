import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-server'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          // These modules intentionally co-locate a provider/component with
          // its hook or styling helper. They are stable public exports, not
          // accidental component state, so Fast Refresh can safely preserve
          // them while the rule remains active for new violations.
          allowExportNames: [
            'DEFAULT_FILTERS',
            'badgeVariants',
            'buttonVariants',
            'useFormField',
            'navigationMenuTriggerStyle',
            'useSidebar',
            'sidebarMenuButtonVariants',
            'toggleVariants',
            'useCart',
            'useInquiryDraft',
            'useTransition',
            'useUser',
            'LANGUAGES',
            'useI18n',
            'useLocale',
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
