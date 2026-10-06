/**
 * react-native-svg stand-in (2.1.0 Analytics Overhaul). The native bridge
 * does not exist in Jest — same shape Expo Go sees before the preview
 * rebuild: every element renders as a plain host View that passes children
 * and testID through, so layout/selection assertions hold without pixels.
 */
const React = require('react');

function host(name) {
  function StandIn(props) {
    const { children, ...rest } = props || {};
    return React.createElement('View', { ...rest, 'data-svg': name }, children);
  }
  StandIn.displayName = name;
  return StandIn;
}

module.exports = {
  Svg: host('Svg'),
  G: host('G'),
  Path: host('Path'),
  Circle: host('Circle'),
  Rect: host('Rect'),
  Line: host('Line'),
  Polyline: host('Polyline'),
  Polygon: host('Polygon'),
  Ellipse: host('Ellipse'),
  Text: host('Text'),
  TSpan: host('TSpan'),
  Defs: host('Defs'),
  LinearGradient: host('LinearGradient'),
  RadialGradient: host('RadialGradient'),
  Stop: host('Stop'),
  ClipPath: host('ClipPath'),
  Mask: host('Mask'),
  Use: host('Use'),
  Symbol: host('Symbol'),
};

module.exports.default = module.exports.Svg;
