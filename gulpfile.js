var gulp = require('gulp');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
var jshint = require('gulp-jshint');

var source = [
  './node_modules/neutriumjs.utilities/src/NeutriumJS.nestedMap.js',
  './src/NeutriumJS.convert.js'
]

gulp.task('default', ['lint', 'compress']);

gulp.task('lint', function() {
  return gulp.src('./src/**/*.js')
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

gulp.task('compress', function() {
  gulp.src(source)
  	.pipe(concat('NeutriumJS.convert.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('./dist'));
});