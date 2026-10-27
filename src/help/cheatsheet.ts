// The OpenSCAD cheatsheet, as data for the Help panel and the editor's hover
// docs. Covers the language as built into this app's OpenSCAD (2026.10.25
// snapshot) with the experimental features it enables (lazy-union only).
// Every `insert` is checked against OpenSCAD by tests/cheatsheet-check.mjs.
//
// `insert` uses Monaco snippet syntax: ${1:default} is a tab stop, so a
// literal $ (as in $fn) is written \$.

export type HelpEntry = {
  /** Identifier the hover docs match on; absent for pure syntax. */
  name?: string,
  /** What the cheatsheet shows. */
  sig: string,
  doc: string,
  /** Snippet inserted on click; omitted when there is nothing useful to insert. */
  insert?: string,
  /** Page (and #section) of the OpenSCAD User Manual. */
  link: string,
};

export type HelpSection = {title: string, entries: HelpEntry[]};

export const manualUrl = (link: string) => `https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/${link}`;

const fn = (name: string, args: string, doc: string, link: string, insert?: string): HelpEntry =>
  ({name, sig: `${name}(${args})`, doc, insert: insert ?? `${name}(\${1:${args}})`, link});

export const cheatsheet: HelpSection[] = [
  {title: 'Syntax', entries: [
    {sig: 'var = value;', doc: 'Assign a variable. The last assignment in a scope wins, for the whole scope.', insert: '${1:var} = ${2:value};', link: 'General#Variables'},
    {sig: 'var = cond ? if_true : if_false;', doc: 'Conditional expression.', insert: '${1:var} = ${2:cond} ? ${3:a} : ${4:b};', link: 'Conditional_and_Iterator_Functions#Conditional_?_:'},
    {sig: 'var = function (x) x + x;', doc: 'Function literal: a function as a value.', insert: '${1:f} = function (${2:x}) ${3:x + x};', link: 'User-Defined_Functions_and_Modules#Function_Literals'},
    {name: 'module', sig: 'module name(…) { … }', doc: 'Define a module (makes geometry). Call it as name();', insert: 'module ${1:name}(${2:size = 10}) {\n\t${3:cube(size);}\n}', link: 'User-Defined_Functions_and_Modules#Modules'},
    {name: 'function', sig: 'function name(…) = …;', doc: 'Define a function (returns a value). Call it as name();', insert: 'function ${1:name}(${2:x}) = ${3:x * 2};', link: 'User-Defined_Functions_and_Modules#Functions'},
    {name: 'include', sig: 'include <file.scad>', doc: 'Paste a file in place: its modules, functions AND top-level code.', insert: 'include <${1:BOSL2/std.scad}>', link: 'Include_Statement'},
    {name: 'use', sig: 'use <file.scad>', doc: 'Import only the modules and functions of a file.', insert: 'use <${1:file.scad}>', link: 'Include_Statement'},
  ]},
  {title: 'Constants', entries: [
    {name: 'undef', sig: 'undef', doc: 'Undefined value.', insert: 'undef', link: 'General#undef'},
    {name: 'PI', sig: 'PI', doc: 'π ≈ 3.14159', insert: 'PI', link: 'Mathematical_Functions#PI'},
  ]},
  {title: 'Operators', entries: [
    {sig: 'n + m   n - m   n * m   n / m   n % m   n ^ m', doc: 'Arithmetic; % is modulo, ^ is exponent. + - * also work on vectors and matrices.', link: 'Mathematical_Operators'},
    {sig: 'n < m   n <= m   n == m   n != m   n >= m   n > m', doc: 'Comparison.', link: 'Mathematical_Operators#Relational_Operators'},
    {sig: 'b && c   b || c   !b', doc: 'Logical and, or, not.', link: 'Mathematical_Operators#Logical_Operators'},
  ]},
  {title: 'Special variables', entries: [
    {name: '$fn', sig: '$fn', doc: 'Fixed number of fragments for circles, spheres, cylinders (overrides $fa/$fs).', insert: '\\$fn = ${1:64};', link: 'Other_Language_Features#$fa,_$fs_and_$fn'},
    {name: '$fa', sig: '$fa', doc: 'Minimum angle of a fragment, in degrees.', insert: '\\$fa = ${1:6};', link: 'Other_Language_Features#$fa,_$fs_and_$fn'},
    {name: '$fs', sig: '$fs', doc: 'Minimum size of a fragment, in mm.', insert: '\\$fs = ${1:0.5};', link: 'Other_Language_Features#$fa,_$fs_and_$fn'},
    {name: '$t', sig: '$t', doc: 'Animation step, 0 to 1.', insert: '\\$t', link: 'Other_Language_Features#$t'},
    {name: '$preview', sig: '$preview', doc: 'true in preview (F5), false in a full render (F6).', insert: '\\$preview', link: 'Other_Language_Features#$preview'},
    {name: '$children', sig: '$children', doc: 'Number of children passed to the current module.', insert: '\\$children', link: 'User-Defined_Functions_and_Modules#Children'},
    {name: '$parent_modules', sig: '$parent_modules', doc: 'Depth of the module call stack.', insert: '\\$parent_modules', link: 'Other_Language_Features#parent_module(n)_and_$parent_modules'},
    {name: '$vpr', sig: '$vpr   $vpt   $vpd   $vpf', doc: 'Viewport rotation, translation, distance, field of view.', link: 'Other_Language_Features#$vpr,_$vpt,_$vpf_and_$vpd'},
  ]},
  {title: 'Modifier characters', entries: [
    {sig: '* cube(10);', doc: 'Disable: the object is ignored.', insert: '*', link: 'Modifier_Characters#Disable_Modifier'},
    {sig: '! cube(10);', doc: 'Show only this object.', insert: '!', link: 'Modifier_Characters#Root_Modifier'},
    {sig: '# cube(10);', doc: 'Highlight / debug: draw it in red (preview).', insert: '#', link: 'Modifier_Characters#Debug_Modifier'},
    {sig: '% cube(10);', doc: 'Transparent / background: shown, not part of the model.', insert: '%', link: 'Modifier_Characters#Background_Modifier'},
  ]},
  {title: '2D', entries: [
    {name: 'circle', sig: 'circle(r | d=…)', doc: 'Circle of radius r or diameter d.', insert: 'circle(${1:r = 10});', link: 'Using_the_2D_Subsystem#circle'},
    {name: 'square', sig: 'square(size, center)', doc: 'Square, side size.', insert: 'square(${1:10}, center = ${2:true});', link: 'Using_the_2D_Subsystem#square'},
    {name: 'square', sig: 'square([w, h], center)', doc: 'Rectangle.', insert: 'square([${1:20}, ${2:10}], center = ${3:true});', link: 'Using_the_2D_Subsystem#square'},
    {name: 'polygon', sig: 'polygon([points])', doc: 'Polygon from a list of [x, y] points.', insert: 'polygon([${1:[0, 0], [10, 0], [0, 10]}]);', link: 'Using_the_2D_Subsystem#polygon'},
    {name: 'polygon', sig: 'polygon([points], [paths])', doc: 'Polygon with holes: paths index into points.', insert: 'polygon(${1:[[0, 0], [10, 0], [0, 10], [2, 2], [5, 2], [2, 5]]}, ${2:[[0, 1, 2], [3, 4, 5]]});', link: 'Using_the_2D_Subsystem#polygon'},
    {name: 'text', sig: 'text(t, size, font, direction, language, script, halign, valign, spacing)', doc: 'Text as 2D geometry.', insert: 'text("${1:Hello}", size = ${2:10}, halign = "${3:center}", valign = "${4:center}");', link: 'Text'},
    {name: 'import', sig: 'import("….ext", convexity)', doc: 'Import 2D (DXF, SVG) or 3D (STL, OFF, 3MF, AMF, OBJ) geometry.', insert: 'import("${1:file.svg}");', link: 'Importing_Geometry#import'},
    {name: 'projection', sig: 'projection(cut)', doc: 'Project 3D children onto the XY plane; cut = true slices at z = 0.', insert: 'projection(cut = ${1:false}) ${2:sphere(10);}', link: 'Using_the_2D_Subsystem#3D_to_2D_Projection'},
  ]},
  {title: '3D', entries: [
    {name: 'sphere', sig: 'sphere(r | d=…)', doc: 'Sphere.', insert: 'sphere(${1:r = 10});', link: 'Primitive_Solids#sphere'},
    {name: 'cube', sig: 'cube(size, center)', doc: 'Cube, side size.', insert: 'cube(${1:10}, center = ${2:true});', link: 'Primitive_Solids#cube'},
    {name: 'cube', sig: 'cube([w, d, h], center)', doc: 'Box.', insert: 'cube([${1:20}, ${2:10}, ${3:5}], center = ${4:false});', link: 'Primitive_Solids#cube'},
    {name: 'cylinder', sig: 'cylinder(h, r | d, center)', doc: 'Cylinder.', insert: 'cylinder(h = ${1:10}, r = ${2:5}, center = ${3:false});', link: 'Primitive_Solids#cylinder'},
    {name: 'cylinder', sig: 'cylinder(h, r1 | d1, r2 | d2, center)', doc: 'Cone / truncated cone.', insert: 'cylinder(h = ${1:10}, r1 = ${2:5}, r2 = ${3:2}, center = ${4:false});', link: 'Primitive_Solids#cylinder'},
    {name: 'polyhedron', sig: 'polyhedron(points, faces, convexity)', doc: 'Solid from points and faces (faces wind clockwise seen from outside).', insert: 'polyhedron(\n\tpoints = ${1:[[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 10]]},\n\tfaces = ${2:[[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]}\n);', link: 'Primitive_Solids#polyhedron'},
    {name: 'linear_extrude', sig: 'linear_extrude(height, center, convexity, twist, slices, scale)', doc: 'Extrude 2D children along Z.', insert: 'linear_extrude(height = ${1:10}, twist = ${2:0}, scale = ${3:1}) ${4:square(10, center = true);}', link: 'Using_the_2D_Subsystem#linear_extrude'},
    {name: 'rotate_extrude', sig: 'rotate_extrude(angle, convexity)', doc: 'Revolve 2D children (in X > 0) around Z.', insert: 'rotate_extrude(angle = ${1:360}) ${2:translate([10, 0]) circle(3);}', link: 'Using_the_2D_Subsystem#rotate_extrude'},
    {name: 'surface', sig: 'surface(file = "….ext", center, convexity)', doc: 'Height map from a .dat or image file.', insert: 'surface(file = "${1:heightmap.png}", center = ${2:true});', link: 'Other_Language_Features#Surface'},
  ]},
  {title: 'Transformations', entries: [
    {name: 'translate', sig: 'translate([x, y, z])', doc: 'Move children.', insert: 'translate([${1:0}, ${2:0}, ${3:0}]) ', link: 'Transformations#translate'},
    {name: 'rotate', sig: 'rotate([x, y, z])', doc: 'Rotate children about X, then Y, then Z (degrees).', insert: 'rotate([${1:0}, ${2:0}, ${3:90}]) ', link: 'Transformations#rotate'},
    {name: 'rotate', sig: 'rotate(a, [x, y, z])', doc: 'Rotate children by a degrees about an axis.', insert: 'rotate(${1:45}, [${2:0}, ${3:0}, ${4:1}]) ', link: 'Transformations#rotate'},
    {name: 'scale', sig: 'scale([x, y, z])', doc: 'Scale children.', insert: 'scale([${1:1}, ${2:1}, ${3:1}]) ', link: 'Transformations#scale'},
    {name: 'resize', sig: 'resize([x, y, z], auto, convexity)', doc: 'Scale children to an absolute size; 0 keeps an axis (or scales it with auto).', insert: 'resize([${1:30}, ${2:0}, ${3:0}], auto = ${4:true}) ', link: 'Transformations#resize'},
    {name: 'mirror', sig: 'mirror([x, y, z])', doc: 'Mirror children in the plane through the origin with this normal.', insert: 'mirror([${1:1}, ${2:0}, ${3:0}]) ', link: 'Transformations#mirror'},
    {name: 'multmatrix', sig: 'multmatrix(m)', doc: 'Apply a 4×4 (or 4×3) affine matrix.', insert: 'multmatrix(${1:[[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]}) ', link: 'Transformations#multmatrix'},
    {name: 'color', sig: 'color("colorname", alpha)', doc: 'Color children by SVG/CSS name.', insert: 'color("${1:red}", ${2:1}) ', link: 'Transformations#color'},
    {name: 'color', sig: 'color("#hexvalue")', doc: 'Color children: #rgb, #rgba, #rrggbb or #rrggbbaa.', insert: 'color("${1:#ff8800}") ', link: 'Transformations#color'},
    {name: 'color', sig: 'color([r, g, b, a])', doc: 'Color children, components 0…1.', insert: 'color([${1:1}, ${2:0.5}, ${3:0}, ${4:1}]) ', link: 'Transformations#color'},
    {name: 'offset', sig: 'offset(r | delta, chamfer)', doc: 'Grow (> 0) or shrink (< 0) 2D children; r rounds corners.', insert: 'offset(${1:r = 2}) ', link: 'Transformations#offset'},
    {name: 'hull', sig: 'hull()', doc: 'Convex hull of the children.', insert: 'hull() {\n\t$0\n}', link: 'Transformations#hull'},
    {name: 'minkowski', sig: 'minkowski(convexity)', doc: 'Minkowski sum of the children (e.g. rounds a cube with a sphere).', insert: 'minkowski() {\n\t$0\n}', link: 'Transformations#minkowski'},
  ]},
  {title: 'Boolean operations', entries: [
    {name: 'union', sig: 'union()', doc: 'Combine children.', insert: 'union() {\n\t$0\n}', link: 'CSG_Modelling#union'},
    {name: 'difference', sig: 'difference()', doc: 'Subtract all later children from the first.', insert: 'difference() {\n\t$0\n}', link: 'CSG_Modelling#difference'},
    {name: 'intersection', sig: 'intersection()', doc: 'Keep what all children share.', insert: 'intersection() {\n\t$0\n}', link: 'CSG_Modelling#intersection'},
  ]},
  {title: 'Lists', entries: [
    {sig: 'list = [a, b, c];', doc: 'Create a list (vector).', insert: '${1:list} = [${2:1, 2, 3}];', link: 'General#Vectors'},
    {sig: 'var = list[2];', doc: 'Index a list (from 0).', insert: '${1:list}[${2:0}]', link: 'General#Indexing_elements_within_vectors'},
    {sig: 'var = list.z;', doc: 'Dot notation: .x .y .z are elements 0, 1, 2.', insert: '${1:list}.${2:x}', link: 'General#Dot_notation_indexing'},
    {sig: '[start : end]   [start : step : end]', doc: 'Range (inclusive), for loops and comprehensions.', insert: '[${1:0} : ${2:1} : ${3:10}]', link: 'General#Ranges'},
  ]},
  {title: 'List comprehensions', entries: [
    {sig: '[ for (i = range | list) i ]', doc: 'Generate a list.', insert: '[for (${1:i} = [${2:0 : 9}]) ${3:i * i}]', link: 'List_Comprehensions#Basic_Syntax'},
    {sig: '[ for (init; condition; next) i ]', doc: 'C-style generator.', insert: '[for (${1:i = 0}; ${2:i < 10}; ${3:i = i + 1}) ${4:i}]', link: 'List_Comprehensions#for'},
    {name: 'each', sig: '[ each i ]', doc: 'Flatten: splice the elements of i into the list.', insert: '[each ${1:list}]', link: 'List_Comprehensions#each'},
    {sig: '[ for (i = …) if (condition(i)) i ]', doc: 'Filter.', insert: '[for (${1:i} = ${2:list}) if (${3:i > 0}) ${1:i}]', link: 'List_Comprehensions#if'},
    {sig: '[ for (i = …) if (condition(i)) x else y ]', doc: 'Choose per element.', insert: '[for (${1:i} = ${2:list}) if (${3:i > 0}) ${4:i} else ${5:0}]', link: 'List_Comprehensions#if/else'},
    {sig: '[ for (i = …) let (assignments) a ]', doc: 'Local variables per element.', insert: '[for (${1:i} = ${2:list}) let (${3:j = i * 2}) ${4:j}]', link: 'List_Comprehensions#let'},
  ]},
  {title: 'Flow control', entries: [
    {name: 'for', sig: 'for (i = [start : end]) { … }', doc: 'Repeat children for each value of a range…', insert: 'for (${1:i} = [${2:0} : ${3:9}]) {\n\t$0\n}', link: 'Conditional_and_Iterator_Functions#For_Loop'},
    {name: 'for', sig: 'for (i = [start : step : end]) { … }', doc: '…with a step…', insert: 'for (${1:i} = [${2:0} : ${3:2} : ${4:10}]) {\n\t$0\n}', link: 'Conditional_and_Iterator_Functions#For_Loop'},
    {name: 'for', sig: 'for (i = [a, b, c]) { … }', doc: '…or of a list.', insert: 'for (${1:i} = [${2:1, 2, 3}]) {\n\t$0\n}', link: 'Conditional_and_Iterator_Functions#For_Loop'},
    {name: 'for', sig: 'for (i = …, j = …, …) { … }', doc: 'Nested loops in one statement.', insert: 'for (${1:i} = [${2:0 : 2}], ${3:j} = [${4:0 : 2}]) {\n\t$0\n}', link: 'Conditional_and_Iterator_Functions#For_Loop'},
    {name: 'intersection_for', sig: 'intersection_for (i = [start : end]) { … }', doc: 'Intersection of all iterations (for unions them).', insert: 'intersection_for (${1:a} = [${2:0, 60, 120}]) {\n\t$0\n}', link: 'Conditional_and_Iterator_Functions#Intersection_For_Loop'},
    {name: 'if', sig: 'if (…) { … } else { … }', doc: 'Conditional geometry.', insert: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}', link: 'Conditional_and_Iterator_Functions#If_Statement'},
    {name: 'let', sig: 'let (…) { … }', doc: 'Local variables for the children (or in an expression).', insert: 'let (${1:x = 1}) {\n\t$0\n}', link: 'Conditional_and_Iterator_Functions#Let_Statement'},
  ]},
  {title: 'Type tests', entries: [
    fn('is_undef', 'x', 'true if x is undef.', 'Type_Test_Functions#is_undef'),
    fn('is_bool', 'x', 'true if x is a boolean.', 'Type_Test_Functions#is_bool'),
    fn('is_num', 'x', 'true if x is a number (not nan).', 'Type_Test_Functions#is_num'),
    fn('is_string', 'x', 'true if x is a string.', 'Type_Test_Functions#is_string'),
    fn('is_list', 'x', 'true if x is a list.', 'Type_Test_Functions#is_list'),
    fn('is_function', 'x', 'true if x is a function literal.', 'Type_Test_Functions#is_function'),
  ]},
  {title: 'Other', entries: [
    {name: 'echo', sig: 'echo(…)', doc: 'Print values to the console (log panel).', insert: 'echo(${1:x});', link: 'Other_Language_Features#Echo_statements'},
    {name: 'render', sig: 'render(convexity)', doc: 'Fully compute children in preview (faster previews of complex CSG).', insert: 'render() ', link: 'Other_Language_Features#Render'},
    {name: 'children', sig: 'children([idx])', doc: 'Inside a module: the children it was called with (all, one, or a range).', insert: 'children(${1:0});', link: 'User-Defined_Functions_and_Modules#Children'},
    {name: 'assert', sig: 'assert(condition, message)', doc: 'Stop with an error if the condition is false.', insert: 'assert(${1:x > 0}, "${2:x must be positive}");', link: 'User-Defined_Functions_and_Modules#Assert'},
  ]},
  {title: 'Functions', entries: [
    fn('concat', 'list, …', 'Join lists into one.', 'Mathematical_Functions#concat', 'concat(${1:a}, ${2:b})'),
    fn('lookup', 'key, [[k, v], …]', 'Linear interpolation in a table.', 'Mathematical_Functions#lookup', 'lookup(${1:x}, ${2:[[0, 0], [10, 100]]})'),
    fn('str', '…', 'Convert values to a string and concatenate them.', 'String_Functions#str', 'str(${1:"x = "}, ${2:x})'),
    fn('chr', 'code, …', 'Characters from Unicode code points.', 'String_Functions#chr', 'chr(${1:65})'),
    fn('ord', 'char', 'Unicode code point of a character.', 'String_Functions#ord', 'ord("${1:A}")'),
    fn('search', 'match, list, num, index', 'Find positions of values in a list or string.', 'Other_Language_Features#Search', 'search(${1:"a"}, ${2:"banana"}, ${3:0})'),
    fn('version', '', 'OpenSCAD version as [year, month, day].', 'Other_Language_Features#version()', 'version()'),
    fn('version_num', '', 'OpenSCAD version as a number, e.g. 20261025.', 'Other_Language_Features#version_num()', 'version_num()'),
    fn('parent_module', 'idx', 'Name of a module up the call stack.', 'Other_Language_Features#parent_module(n)_and_$parent_modules', 'parent_module(${1:0})'),
  ]},
  {title: 'Math', entries: [
    fn('abs', 'x', 'Absolute value.', 'Mathematical_Functions#abs'),
    fn('sign', 'x', '-1, 0 or 1.', 'Mathematical_Functions#sign'),
    fn('sin', 'deg', 'Sine of an angle in degrees.', 'Mathematical_Functions#sin'),
    fn('cos', 'deg', 'Cosine of an angle in degrees.', 'Mathematical_Functions#cos'),
    fn('tan', 'deg', 'Tangent of an angle in degrees.', 'Mathematical_Functions#tan'),
    fn('asin', 'x', 'Arc sine, in degrees.', 'Mathematical_Functions#asin'),
    fn('acos', 'x', 'Arc cosine, in degrees.', 'Mathematical_Functions#acos'),
    fn('atan', 'x', 'Arc tangent, in degrees.', 'Mathematical_Functions#atan'),
    fn('atan2', 'y, x', 'Angle of the point (x, y), in degrees.', 'Mathematical_Functions#atan2', 'atan2(${1:y}, ${2:x})'),
    fn('floor', 'x', 'Round down.', 'Mathematical_Functions#floor'),
    fn('round', 'x', 'Round to the nearest integer (halves away from 0).', 'Mathematical_Functions#round'),
    fn('ceil', 'x', 'Round up.', 'Mathematical_Functions#ceil'),
    fn('ln', 'x', 'Natural logarithm.', 'Mathematical_Functions#ln'),
    fn('log', 'x', 'Base-10 logarithm (log(b, x) for base b).', 'Mathematical_Functions#log'),
    fn('exp', 'x', 'e to the power x.', 'Mathematical_Functions#exp'),
    fn('pow', 'base, exp', 'Power; same as base ^ exp.', 'Mathematical_Functions#pow', 'pow(${1:base}, ${2:2})'),
    fn('sqrt', 'x', 'Square root.', 'Mathematical_Functions#sqrt'),
    fn('len', 'list | string', 'Number of elements or characters.', 'Mathematical_Functions#len', 'len(${1:list})'),
    fn('min', 'a, b, … | list', 'Smallest value.', 'Mathematical_Functions#min', 'min(${1:a}, ${2:b})'),
    fn('max', 'a, b, … | list', 'Largest value.', 'Mathematical_Functions#max', 'max(${1:a}, ${2:b})'),
    fn('norm', 'v', 'Length of a vector.', 'Mathematical_Functions#norm', 'norm(${1:v})'),
    fn('cross', 'a, b', 'Cross product of two 3D (or 2D) vectors.', 'Mathematical_Functions#cross', 'cross(${1:a}, ${2:b})'),
    fn('rands', 'min, max, count, seed', 'List of random numbers.', 'Mathematical_Functions#rands', 'rands(${1:0}, ${2:1}, ${3:5}, ${4:42})'),
  ]},
];

/** Entries by identifier, for hover docs. */
export const cheatsheetByName: Map<string, HelpEntry[]> = new Map();
for (const section of cheatsheet) {
  for (const entry of section.entries) {
    if (entry.name) cheatsheetByName.set(entry.name, [...(cheatsheetByName.get(entry.name) ?? []), entry]);
  }
}
