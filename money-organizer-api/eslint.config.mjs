// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  //{
  //  ignores: ['eslint.config.mjs'],
  //},
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
    {
    rules: {
            "prettier/prettier": "warn",         // formatting violations = ESLint errors
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/explicit-function-return-type": "warn",
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', {
                'varsIgnorePattern': '^_',  // ignora variáveis que começam com _
            }],
            '@typescript-eslint/no-unsafe-argument': 'off',    
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-sparse-arrays': "warn", 
    },
  },
);
