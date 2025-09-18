'use client'

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  Palette, 
  Sun, 
  Moon, 
  Check, 
  Sparkles,
  Droplets,
  TreePine,
  Sunset,
  Crown,
  Moon as MoonIcon
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { Theme } from '../../utils/themes';

interface ThemeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

const themeIcons = {
  oceanBreeze: Droplets,
  forestGreen: TreePine,
  sunsetOrange: Sunset,
  royalPurple: Crown,
  midnightBlue: MoonIcon,
};

const themeIconsDark = {
  oceanBreezeDark: Droplets,
  forestGreenDark: TreePine,
  sunsetOrangeDark: Sunset,
  royalPurpleDark: Crown,
  midnightBlueDark: MoonIcon,
};

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({ isOpen, onClose }) => {
  const { currentTheme, isDarkMode, themeName, setTheme, toggleDarkMode, availableThemes } = useTheme();
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);

  const handleThemeSelect = (theme: Theme) => {
    setTheme(theme.name.replace('Dark', ''));
    onClose();
  };

  const handlePreview = (theme: Theme) => {
    setPreviewTheme(theme.name);
  };

  const handlePreviewEnd = () => {
    setPreviewTheme(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          {/* Theme Selector Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-2 shadow-2xl">
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                      className="p-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600"
                    >
                      <Palette className="w-6 h-6 text-white" />
                    </motion.div>
                    <div>
                      <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        Choose Your Theme
                      </CardTitle>
                      <p className="text-gray-600 dark:text-gray-400">
                        Select a beautiful theme that matches your style
                      </p>
                    </div>
                  </div>
                  
                  {/* Dark Mode Toggle */}
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      onClick={toggleDarkMode}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                        isDarkMode
                          ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white hover:from-slate-600 hover:to-slate-700'
                          : 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:from-yellow-500 hover:to-orange-600'
                      }`}
                    >
                      {isDarkMode ? (
                        <>
                          <Moon className="w-4 h-4" />
                          <span>Dark</span>
                        </>
                      ) : (
                        <>
                          <Sun className="w-4 h-4" />
                          <span>Light</span>
                        </>
                      )}
                    </Button>
                  </motion.div>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {availableThemes.map((theme, index) => {
                    const IconComponent = isDarkMode 
                      ? themeIconsDark[theme.name as keyof typeof themeIconsDark]
                      : themeIcons[theme.name.replace('Dark', '') as keyof typeof themeIcons] || Sparkles;
                    
                    const isSelected = theme.name === themeName || theme.name === `${themeName}Dark`;
                    const isPreviewing = previewTheme === theme.name;

                    return (
                      <motion.div
                        key={theme.name}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.02, y: -5 }}
                        className="relative"
                      >
                        <Card
                          className={`cursor-pointer transition-all duration-300 border-2 ${
                            isSelected
                              ? 'border-blue-500 shadow-lg shadow-blue-500/25'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          } ${isPreviewing ? 'ring-2 ring-purple-500 ring-opacity-50' : ''}`}
                          onClick={() => handleThemeSelect(theme)}
                          onMouseEnter={() => handlePreview(theme)}
                          onMouseLeave={handlePreviewEnd}
                        >
                          {/* Theme Preview */}
                          <div className="h-32 relative overflow-hidden">
                            <div 
                              className="absolute inset-0 bg-gradient-to-br"
                              style={{
                                background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.secondary})`
                              }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                            
                            {/* Theme Icon */}
                            <div className="absolute top-4 left-4">
                              <div 
                                className="p-2 rounded-lg text-white shadow-lg"
                                style={{ backgroundColor: theme.colors.accent }}
                              >
                                <IconComponent className="w-5 h-5" />
                              </div>
                            </div>
                            
                            {/* Selected Badge */}
                            {isSelected && (
                              <div className="absolute top-4 right-4">
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="p-1 rounded-full bg-green-500 text-white"
                                >
                                  <Check className="w-4 h-4" />
                                </motion.div>
                              </div>
                            )}
                            
                            {/* Color Palette Preview */}
                            <div className="absolute bottom-4 left-4 right-4 flex space-x-1">
                              <div 
                                className="w-6 h-6 rounded-full border-2 border-white shadow-lg"
                                style={{ backgroundColor: theme.colors.primary }}
                              />
                              <div 
                                className="w-6 h-6 rounded-full border-2 border-white shadow-lg"
                                style={{ backgroundColor: theme.colors.secondary }}
                              />
                              <div 
                                className="w-6 h-6 rounded-full border-2 border-white shadow-lg"
                                style={{ backgroundColor: theme.colors.accent }}
                              />
                            </div>
                          </div>

                          <CardContent className="p-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                                  {theme.displayName}
                                </h3>
                                {isSelected && (
                                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    Active
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {theme.description}
                              </p>
                              
                              {/* Theme Colors Preview */}
                              <div className="flex space-x-1 mt-3">
                                <div 
                                  className="w-4 h-4 rounded border border-gray-200 dark:border-gray-700"
                                  style={{ backgroundColor: theme.colors.primary }}
                                  title="Primary"
                                />
                                <div 
                                  className="w-4 h-4 rounded border border-gray-200 dark:border-gray-700"
                                  style={{ backgroundColor: theme.colors.secondary }}
                                  title="Secondary"
                                />
                                <div 
                                  className="w-4 h-4 rounded border border-gray-200 dark:border-gray-700"
                                  style={{ backgroundColor: theme.colors.accent }}
                                  title="Accent"
                                />
                                <div 
                                  className="w-4 h-4 rounded border border-gray-200 dark:border-gray-700"
                                  style={{ backgroundColor: theme.colors.success }}
                                  title="Success"
                                />
                                <div 
                                  className="w-4 h-4 rounded border border-gray-200 dark:border-gray-700"
                                  style={{ backgroundColor: theme.colors.warning }}
                                  title="Warning"
                                />
                                <div 
                                  className="w-4 h-4 rounded border border-gray-200 dark:border-gray-700"
                                  style={{ backgroundColor: theme.colors.error }}
                                  title="Error"
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Footer */}
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <Sparkles className="w-4 h-4 inline mr-1" />
                      Themes automatically adapt to your dark/light mode preference
                    </div>
                    <Button
                      onClick={onClose}
                      variant="outline"
                      className="px-6"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
