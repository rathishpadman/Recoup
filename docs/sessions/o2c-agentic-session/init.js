/* Reveal initialisation for the Recoup architecture walkthrough.
   Kept small and explicit - the deck is presented from a laptop with no
   network, so nothing here may reach out. */
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  Reveal.initialize({
    hash: true,               // deep links: #/5 and #/5/3 for a fragment
    slideNumber: "c/t",
    controls: true,
    controlsTutorial: false,
    progress: true,
    overview: true,
    center: false,
    disableLayout: false,
    width: 1600,
    height: 900,
    margin: 0.02,
    minScale: 0.2,
    maxScale: 2.0,
    transition: reduced ? "none" : "fade",
    transitionSpeed: "fast",
    backgroundTransition: "none",
    autoAnimateEasing: "cubic-bezier(0.2, 0, 0, 1)",
    autoAnimateDuration: reduced ? 0 : 0.55,
    // A handout that hides half its content is worse than no handout.
    pdfSeparateFragments: false,
    plugins: [RevealNotes, RevealZoom]
  });

  // T toggles the theme. Reveal owns most keys; these are free.
  Reveal.addKeyBinding(
    { keyCode: 84, key: "T", description: "Toggle light / dark" },
    function () {
      var root = document.documentElement;
      var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var now = root.getAttribute("data-theme") || (dark ? "dark" : "light");
      root.setAttribute("data-theme", now === "dark" ? "light" : "dark");
    }
  );

  // L jumps to the architecture map, D to the demo stage. During Q&A the
  // question is almost always "show me that layer again".
  Reveal.addKeyBinding(
    { keyCode: 76, key: "L", description: "Jump to architecture map" },
    function () { Reveal.slide(4); }
  );
  Reveal.addKeyBinding(
    { keyCode: 68, key: "D", description: "Jump to demo stage" },
    function () {
      var el = document.getElementById("demo-stage");
      if (el) Reveal.slide(Reveal.getIndices(el).h);
    }
  );

  // Progressive focus on the seven-layer map: a slide carrying data-focus-layer
  // lifts that layer and recedes the others, so a deep dive can point back at
  // the map without redrawing it.
  Reveal.on("slidechanged", function (event) {
    var focus = event.currentSlide.getAttribute("data-focus-layer");
    var layers = event.currentSlide.querySelectorAll(".layer");
    for (var i = 0; i < layers.length; i++) {
      var n = layers[i].getAttribute("data-layer");
      layers[i].classList.toggle("is-dim", !!focus && n !== focus);
      layers[i].classList.toggle("is-on", !!focus && n === focus);
    }
  });
}());
