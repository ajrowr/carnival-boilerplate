
/* 
"Concrete" refers to the scene subclass created by the developer.
"Framework" refers to things in the framework which you shouldn't override :)

Initialisation procedure for a Scene:
- User code sets window.vrScene to a new instance of the Scene class
-   concrete scene constructor is run
-   concrete constructor MUST do FCScene.call(this) to call the framework scene constructor!
-   constructor completes its various tasks, mostly setting up basic instance data which will be used by later stages of the setup
- FCEngine is loaded by the HTML (eg <script src="/fc_engine.js"), and looks for the scene as window.vrScene
-   calls framework method init(), passing it the GL instance and (if applicable) the stage parameters
-   calls framework method setup() method
-       calls framework method loadPrerequisites(), which autoloads items configured in scene.prerequisites 
-       calls optional concrete method setPrereqs(), which handles any other tasks which must be entirely completed prior to scene setup. This must
        return a promise that will resolve once its job is done; the next steps will not begin until this promise resolves.
-       calls concrete method setupScene(), which actually builds the scene. setupScene can rely on all prerequisites loaded in the previous steps
        being available. You can use asynchronous constructs in setupScene, eg to load JSON feeds and other remote resources; the idea is to get 
        the basic scene visible as quick as possible; having things that "pop into" the scene is generally preferable to making the user wait a 
        long time before seeing anything.
*/

window.ExperimentalScene = (function () {
    "use strict";
    var $$ = CARNIVAL;
    
    /* Angles are expressed in radians, so it's worth making it easy to convert them. */
    var DEG = deg => deg*(Math.PI/180);
    var RAD = rad => rad; 
    
    function Scene() {
        FCScene.call(this); /* << Don't remove this! */
        
        var scene = this; /* << Not compulsory but a good habit to have for scene instance methods. */
        
		//components.meta4vr.net/
		//assets.meta4vr.net/
        // scene.coreComponentLibrary = new $$.component.ComponentLibrary('//components.meta4vr.net');
        scene.coreComponents = new $$.component.ComponentLibrary('/_components');
		scene.myComponents = new $$.component.ComponentLibrary('/_components');
		let assetPath = (assetType, assetName, extn) => `//assets.meta4vr.net/${assetType}/${assetName}.${extn}`;
		let coreComponent = (globalName, localName) => ({library: scene.coreComponents, globalName, localName});
        let shaderAsset = (shaderFile, label) => ({
            label,
            srcVertexShader: assetPath('shaders', `${shaderFile}/shader`, 'vs'),
            srcFragmentShader: assetPath('shaders', `${shaderFile}/shader`, 'fs')
        });
        let textureAsset = (textureFile, label) => ({
            label,
            src: assetPath('textures', textureFile, 'jpg')
        });
        let material = (label, color, textureLabel, shaderLabel, lighting) => ({
            label,
            color,
            textureLabel,
            shaderLabel,
            ambient: lighting.ambient,
            diffuse: lighting.diffuse,
            specular: lighting.specular
        });
		let c3v = v => [v, v, v]; // "consistent 3vec"
		
        /* Declare any class and instance vars unique to this scene, here.
           This constructor is called before the machinery of the engine is fully initialised, so this is the right place for
           configuration that doesn't depend on other parts of the system, and declaring instance vars which will be filled in later.
           
           Prerequisites are things that will be loaded and/or built before the scene setup. The ones defined here will
           be automatically loaded, and scene setup will be forced to wait until they finish loading, so
           anything fundamental to the initialization of the scene should be considered a prerequisite.
           However it is not ideal to make the user wait for too long so be wary of using large
           downloads as prerequisistes.
           Each of the items in scene.prerequisites will be mapped into scene.<thingtype>.<label> once built.
           (Except for colors which are actually just simple textures are are mapped into scene.textures.<label>)
        */
        scene.prerequisites = {
            shaders: [
                /* Basic is very simple and doesn't take lighting into account */
				shaderAsset('lightingmodel/basic_v1', 'basic'),
                
                /* Diffuse is a fairly straightforward shader; static directional lights = no setup required and nearly */
                /* impossible to break */
				shaderAsset('lightingmodel/diffuse_v1', 'diffuse'),
                
                /* ADS is Ambient Diffuse Specular; a fairly flexible & decent quality shader which supports */
                /* up to 7 positional lights, and materials. Needs to be setup correctly tho otherwise you */
                /* won't see much of anything. All the materials and lights are configured with ADS in mind. */
                /* NB. specular doesn't work properly yet (see ads_v1.vs for explanation) so YMMV. */
				shaderAsset('lightingmodel/ads_v1', 'ads')
            ],
            meshes: [
            ],
            colors: [
            ],
            textures: [
				// textureAsset('concrete01', 'surfaces/manmade/concrete01.jpg')
				textureAsset('surfaces/manmade/concrete01', 'concrete01')
            ],
            materials: [
				material('concrete', null, 'concrete01', 'ads', {ambient:c3v(1), diffuse:c3v(0.5)}),
				material('matteplastic', 'white', null, 'ads', {ambient:c3v(0), diffuse:c3v(0.8)})
            ],
			
			/* These components will be pre-loaded and made available for spawning */
			components: [
				coreComponent('vrui.sys.controller.vive_lowpoly', 'vivecontroller'),
				coreComponent('vrui.display.text.glyphtext', 'glyphtext'),
				coreComponent('vrui.display.mesh.urlmesh', 'urlmesh'),
				coreComponent('vrui.display.pic.picboard', 'picboard'),
				coreComponent('vrui.shape.basicshape', 'shape')
			]
        }
		
		
	        // let scene = this;
	        // let $cl = scene.coreComponentLibrary;
	        // return new Promise(function (resolve, reject) {
	        //     let promises = [
	        //         $cl.load('net.meta4vr.vrui.sys.controller.vive_lowpoly', 'controller'),
	        //         $cl.load('net.meta4vr.glyphtext', 'glyphtext'),
	        //         $cl.load('net.meta4vr.urlmesh', 'urlmesh'),
	        //         $cl.load('net.meta4vr.picboard', 'picboard'),
	        //         $cl.load('net.meta4vr.shape', 'shape')
	        //     ];
	        //     Promise.all(promises).then(things => resolve());
	        // })
		
        
        /* A good general pattern for lights is to have a bright white (or slightly yellow) diffuse one overhead of the scene origin
           (ie. the center of the player's starting stage) and then some dimmer, lower-set diffuse ones to
           illuminate the back sides of things. It really depends on where in the scene you expect the player to
           be spending their time.
           Ambient is not very useful in a low-texture environment as it washes out the polygons of any non-flat
           surfaces so it's best to save it for flat things like floors and walls.
        */
        scene.lightPool = {
            plainWhiteAmbientOverhead: { /* To be honest it's slightly yellow */
                position: [0.0, 3.0, 1.0, 1.0],
                ambient: [0.5, 0.5, 0.5],
                diffuse: [0.7, 0.7, 0.6],
                specular: [0.0, 0.0, 0.0]
            },
            red: {position: [0, 2, 0, 0], diffuse: [0.8, 0.0, 0.0]},
            green: {position: [2, 2, 0, 0], diffuse: [0.0, 0.8, 0.0]},
            blue: {position: [-2, 2, 0, 0], diffuse: [0.0, 0.0, 0.8]}
        }
        /* All specular components in the default lights are switched off due to the aforementioned */
        /* shader issues with specular. */
        
            
        scene.lights = [
            this.lightPool.plainWhiteAmbientOverhead,
            this.lightPool.red,
            this.lightPool.green,
            this.lightPool.blue
        ];
        /* If you ever want to change the lighting of the scene while it's rendering,
           call scene.updateLighting() after changing scene.lights - this will
           re-bind the lights to the shader uniforms.
           You can also bind specific lights to individual positions in the shader
           with scene.bindLightToShaderPosition(lightDef, shader, lightIdx).
           To bind a set of lights at once use scene.bindLightsToShader([lightDef, ...], shader). This
           replaces all current lights.
           To switch lights off you can provide a value of null to these methods.
           Note that lights don't need to be in the lightPool to use them - it's
           just for convenience. You can have lights be just as dynamic as you'd like,
           as long as the shader uniforms are kept up to date.
           
           Keep in mind that only certain shaders support lights and materials, none of this 
           will have any effect on the diffuse or basic shaders for instance.
           
           Occasionally we want things to track the motion of the controllers.
           To make this simple, we'll pre-configure behaviour functions to handle this, and place them
           in scene.trackers.
        */
        scene.trackers = {a:null, b:null};
        
        /* Toggle to show or hide the lights for debugging */
        scene.lightsShown = false;
        
        
    }
    
    Scene.prototype = Object.create($$.scene.Scene.prototype);
    
	/* 	Most prereqs will be automatically loaded by adding them to scene.prerequisites in the constructor, and letting 
	   	the autoloader handle them.
		However, you may have some special setup that you want to do before the scene starts rendering, so wrap that in a promise
		and put it in setupPrereqs.
		Examples include: loading user configuration, ...
	*/
    Scene.prototype.setupPrereqs = function () {
        return new Promise(function (resolve, reject) {resolve()});
        
    }
    
	/* Actual useful things the scene can do */
	
    /* Teleport user and their raft to the location of the cursor. */
    /* By default this is bound to the grip button on the controller. */
    Scene.prototype.teleportUserToCursor = function () {
        var curs = this.getObjectByLabel('cursor');
        this.movePlayerTo(curs.drawable.pos);
    }
    
    /* Helpful for debugging lights */
    /* Pass true to switch lights on, false to switch them off, or nothing (undefined) to toggle their state */
    /* By default this is bound to menu button on the controller. */
    Scene.prototype.showLights = function (state) {
        var lamps = [];
        state = state || (state === undefined && !this.lightsShown);
        this.lightsShown = state;
        this.removeObjectsInGroup('lamps');
        if (state) {
            for (var i=0; i<this.lights.length; i++) {
                var myLight = this.lights[i];
                if (!(myLight.diffuse && myLight.position)) continue;
                var tex = this.addTextureFromColor({r:myLight.diffuse[0], g:myLight.diffuse[1], b:myLight.diffuse[2]});
                var c = new FCShapes.SimpleCuboid(
                    {x:myLight.position[0], y:myLight.position[1], z:myLight.position[2]},
                    {w:0.3, h:0.3, d:0.3},
                    null, {texture:tex, shaderLabel:'basic', groupLabel:'lamps'}
                );
                lamps.push(c);
                this.addObject(c);
            }
        }
        return lamps;
    }
    
    Scene.prototype.setupScene = function () {
        var scene = this;
        var _hidden = function () {return {x:0, y:-100, z:0};} /* For things that get positioned dynamically eg cursor and controller trackers */
        
        console.log('Setting up scene...');
        
        let $xyz = (x, y, z) => ({x:x, y:y, z:z});
        let $hidden = () => $xyz(0, -10, 0);            /* For when you want to hide something under the floor */
        let $colorTex = l => $$.colors[l].asTexture();
        let $addToScene = o => scene.addObject(o);
		
		let $clib = scene.coreComponents;
		
        let floor = $clib.new('shape')({
            shape: 'partition',
            label: 'floor',
            draw: {
                position: $xyz(0, -0.02, 0),
                size: {minX: -20, maxX: 20, minY: -20, maxY: 20},
                orientation: $xyz(DEG(270), 0, 0),
                materialLabel: 'concrete',
                segmentsX: 10,
                segmentsY: 10
            }
        });
        floor.prepare().then($addToScene);
		
		
		
		
		
        /* 	Build the Raft. */
        /* 	For room-scale apps, the Raft is the piece of floor that the player stands on, with bounds equal to the 
           	player's pre-defined play area. It's usually worthwhile to show this visually.
			
           	In the Carnival framework, our standard way of letting the player move further than their floor space is
           	to relocate them via teleportation (on the Vive, this is assigned by default to the grip button). 
			The Raft then automatically relocates itself (via an attached behavior) to the player.
        */
		
        
        /* The stage is a rectangle centered on 0, 0, 0; so it extends as far as 1/2 its size in */
        /* both positive and negative directions along the x and z axes. */
        let stageExtent = {
            x: scene.stageParams.sizeX / 2,
            z: scene.stageParams.sizeZ / 2
        };
        /* Build a behavior function to make the raft follow the player as they teleport */
        let raftPosUpdateBehavior = (drawable, timePoint) => {
            let pl = scene.playerLocation;
            drawable.pos.x = pl.x;
            drawable.pos.y = pl.y;
            drawable.pos.z = pl.z;
        };
        /* Construct the raft & add it to the scene */
        let raft = $clib.new('shape')({
            shape: 'partition',
            label: 'raft',
            draw: {
                position: $xyz(0, 0, 0),
                orientation: $xyz(DEG(270), 0, 0),
                size: {minX: -1*stageExtent.x, maxX: stageExtent.x, minY: -1*stageExtent.z, maxY: stageExtent.z},
                materialLabel: 'concrete',
                color: 'royalblue',
                segmentsX: 1,
                segmentsY: 1
            },
            behaviors: [
                {function: raftPosUpdateBehavior, label: 'followPlayer'}
            ]
        });
        raft.prepare().then($addToScene);
		
		
		
		
        /* Build the cursor */
        let cursor = $clib.new('shape')({
            shape: 'cuboid',
            label: 'cursor',
            draw: {
                position: $hidden(),
                size: {width: 0.3, height: 0.3, depth: 0.3},
                color: 'green'
            }
        });
        /* Add a simple behavior to make the cursor revolve slowly. */
        /* Behaviors are just functions that accept a drawable object and the current time in milliseconds.
           Every drawable in the scene has its behaviors called on every frame.
        */
        cursor.addBehavior(function (drawable, timePoint) {
            drawable.currentOrientation = $xyz(0.0, Math.PI*2*(timePoint/7000), 0.0);
        });
        cursor.prepare().then($addToScene);
		
		
		
		
		
		
		
     /* === === === Controllers === === === */
     
     /* We need a few things to work together for the controllers to be useful.
        - button handlers - functions that are called to check and act on the button state of each controller
        - trackers - behaviour functions which attach to an object and map its spatial disposition to match
          that of the motion controller hardware
        - ray projectors - project a virtual ray from a controller to implement behavior based on pointing
        - colliders - a means of testing projected rays against objects
        - chrome - the aspects of a controller that are visualised in the simulation
     */
     
     /* Many of these things are provided by the various components in play, so it's mostly just a
        matter of configuring them correctly. */
     
     /* Button handler for the controllers. 
        This is basically the top-level arbiter of all behavior that stems from button presses on a
        controller; so it's pretty important.
        The button handlers are one of the main things that you'll be customising when you build an app.
        Note that you can use totally distinct button handlers for different controllers,
        but if you do then you probably want to make their chrome visually distinctive too.
        
        The default button handler does these things:
        - Grip button: Teleport user and raft to cursor location
        - Menu button: Toggle showing/hiding the lights
        - Trigger: Dump to console the current location of the controller whose trigger was pressed
        - Any button: Output button status to console
     
        Buttons for Vive controller are - 0: trackpad, 1: trigger 2: grip, 3: menu
        Statuses are: pressed, released, up, held
        up means button is not pressed.
        pressed means the button transitioned from up to down.
        released means the button transitioned from down to up.
        held means the button started down and stayed down
     
        If the trackpad is involved, sector will be one of n, ne, e, se, s, sw, w, nw, center
        If you need more precision than that, consider writing a custom tracker :)
        Buttonhandlers are called once per anim frame. 
     */
     var buttonHandler = function (gamepadIdx, btnIdx, btnStatus, sector, myButton, extra) {
         if (btnStatus != 'up') {
             /* Print status of buttons */
             console.log('Button idx', btnIdx, 'on controller', gamepadIdx, 'was', btnStatus); // << this gets annoying pretty quickly!
             
             /* Print trackpad sector info */
             if (btnIdx == 0) {
                 console.log('Sector', sector);
             }
             /* Dump controller location on trigger */
             else if (btnIdx == 1 && btnStatus == 'pressed') {
                 console.log(scene.playerSpatialState.hands[gamepadIdx].pos);
             }
             /* Teleport user */
             else if (btnIdx == 2 && btnStatus == 'pressed') {
                 scene.teleportUserToCursor();
             }
             /* Show/hide the scene lights */
             else if (btnIdx == 3 && btnStatus == 'pressed') {
                 scene.showLights();
             }
         }
     };
     
     /*
     pressed
     up
     down
     released
     clicked
     doubleclicked
     held
     
     */
     /* TODO new-style button handler. Simpler API and allows multiple buttons to work together */
     /* TODO how to detect which platform? navigator.getGamepads() and widow.vrDisplay.displayName */
     /* NB: if you componentise the different platform controllers, then you don't need to do
         $ctrl.makeViveButtonHandler because you can do 
         $ctrl = $cl.componentClass('viveController').makeButtonHandler
         $ctrl = $cl.componentClass('oculusTouchController').makeButtonHandler
         .. .makeButtonMap (for simple mappings)
     */
     // var buttonHandler = $ctrl.makeViveButtonHandler(function (gamepadIndex, buttons) {
     //     if (buttons.grip.pressed) {
     //         scene.teleportUserToCursor();
     //     }
     //     else if (buttons.menu.doubleClicked) {
     //         scene.toggleShowLights();
     //     }
     //     else {
     //
     //     }
     // });
             
     /* Build a pair of simple trackers and add them to the scene for later re-use. */
     let $ctrl = $clib.componentClass('vivecontroller');
     scene.trackers.a = $ctrl.makeTracker(scene, 0, null);
     scene.trackers.b = $ctrl.makeTracker(scene, 1, null);
     
     
     /* Now let's build and configure the controllers. */
     /* We will project a virtual ray from the controller and test it against a collider */
     /* to determine where the player is pointing their controller; ie, the cursor location. */
     /* We can get the floor component to provide us a suitable collider. */
     /* The collider fires callbacks when a collision is detected. */
     let floorCollider = floor.getCollider('planar');
     
     /* This callback simply sets the location of the cursor to the point where the ray collided with the floor. */
     floorCollider.callback = function (dat) {
         let c = scene.getObjectByLabel('cursor');
         if (dat.POI < 0) {
             c.drawable.hidden = false;
             c.drawable.pos.x = dat.collisionPoint[0];
             c.drawable.pos.y = dat.collisionPoint[1];
             c.drawable.pos.z = dat.collisionPoint[2];
         }
         else {
             c.hidden = true;
         }            
     };
             
     /* Next, we use some class methods of the controller component to build trackers and a ray projector. */
     /* The ray projector needs to know about all the colliders it is expected to test against. */
     var c0ButtonHandlingTracker = $ctrl.makeTracker(scene, 0, buttonHandler);
     var c0RayProjector = $ctrl.makeRayProjector(scene, 0, [floorCollider]);
     var c1ButtonHandlingTracker = $ctrl.makeTracker(scene, 1, buttonHandler);
             
     /* Now, bring these things together and fabricate the controllers. */
     let controllerCfgs = [
         {label: 'c0', behaviors: [
             {function: c0ButtonHandlingTracker, label: 'tracker'},
             {function: c0RayProjector, label: 'rayProjector'}
         ], config: {
             mainTexture: $colorTex('seagreen'), altTexture: $colorTex('white'), gamepadIndex: 0
         }},
         {label: 'c1', behaviors: [
             {function: c1ButtonHandlingTracker, label: 'tracker'}
         ], config: {
             mainTexture: $colorTex('royalblue'), altTexture: $colorTex('white'), gamepadIndex: 1
         }}
     ];
     controllerCfgs.forEach(cfg => ($clib.new('vivecontroller')(cfg)).prepare().then($addToScene));
     
		
		
		
		
		
		
     /* === === === Putting some things in the scene === === === */
     /* Let's use components to add text to the scene.
     */  
     
     /* Add some simple text made of 3d glyph meshes */
     var text1 = $clib.new('glyphtext')({
         label: 'text1',
         draw: {
             position: $xyz(2, 0.3, 3),
             orientation: $xyz(0, DEG(180), 0),
             color: 'white'
         },
         config: {
             fontTag: 'lato-bold'
         },
         input: {
             text: '#virtualreality'
         }
     });
     text1.prepare().then($addToScene);
     
     /* For this we're going to generate the text, and add a glyph from FontAwesome */
     let text2 = $clib.new('glyphtext')({
         label: 'text2',
         draw: {
             position: $xyz(-1.7, 0.3, -3),
             orientation: $xyz(0, 0, 0),
             color: 'white'
         },
         config: {
             fontTag: 'lato-bold'
         },
         input: {
             text: '/meta4vr'
         }
     });
     
     /* The entire FontAwesome v4.6.3 glyphset is on meshbase. */
     /* To get the hexcodes google "fontawesome cheat sheet" */
     /* TODO this is a bit esoteric because of the lack of a component.. */
     /* .. problem is that components can't currently contain each other. */
     $$.mesh.load('//meshbase.meta4vr.net/_typography/fontawesome/glyph_'+0xf230+'.obj')
     .then(function (mesh) {
         let pos = $xyz(-0.99, 0.0, 0); // Relative to origin of container
         let fbBlue = $$.color('#3b5998');
         let drawCfg = {materialLabel:'matteplastic', texture:fbBlue.asTexture()};
         var fbIcon = new $$.mesh.Mesh(mesh, pos, {scale:1.0}, null, drawCfg);
         text2.drawable.addChild(fbIcon);
     });
     text2.prepare().then($addToScene);
     
     /* TODO this will be an alternative way of building the FB icon as soon as I can add child components */
     let fbicon = $clib.new('urlmesh')({
         label: 'fbLogo',
         draw: {
             position: $xyz(1, 1, 3),
             orientation: $xyz(0, 0, 0),
             color: '#2255ff'
         },
         config: {
             meshURL: '//meshbase.meta4vr.net/_typography/fontawesome/glyph_'+0xf230+'.obj'
         }
     });
     fbicon.prepare().then($addToScene);
     
     /* TODO addChild at the component level? */
     
     // var box = new $$.components.shape({
     //     shape: 'cuboid',
     //     label: 'box',
     //     draw: {
     //         position: {x:0, y:1, z:3},
     //         size: {width: 2, height: 2, depth: 2}
     //         // TODO default texture is invalid; that's not good :-O
     //     }
     // });
     // box.prepare().then($addToScene);
     
     
     
		
		
}		
		
		
		
Scene.prototype.setupSceneOrig = function () {		
		
		
		
        /* Build the cursor */
        // var cursor = new FCShapes.SimpleCuboid(
        //     _hidden(),
        //     {w: 0.3, h:0.3, d:0.3},
        //     null,
        //     {label: 'cursor', materialLabel:'matteplastic', textureLabel: 'red'}
        // );
        // /* Make the cursor revolve slowly */
        // cursor.behaviours.push(function (drawable, timePoint) {
        //     drawable.currentOrientation = {x:0.0, y:Math.PI*2*(timePoint/7000), z:0.0};
        // });
        // scene.addObject(cursor);
        
        // /* Build the floor */
        // var floor = new FCShapes.WallShape(
        //     {x: 0, z: 0, y: -0.02},
        //     {minX: -20, maxX: 20, minY: -20, maxY: 20},
        //     {x:DEG(270), y:0, z:0},
        //     {label: 'floor', materialLabel:'concrete', segmentsX: 10, segmentsY: 10}
        // );
        /* We use the floor collider to determine where the user is pointing their controller, and hence,
           the location for the cursor. There are two stages to this, first is setting up the collider.
           Note the planeNormal - this is the normal of the floor *before it is rotated into position*.
           Basically any planar collider has to match the original state of an object before that object
           is transformed.
           This is perhaps counterintuitive and may change. Colliders generally are not as easy to use, yet,
           as I would like.
        */
        // var floorCollider = new FCUtil.PlanarCollider({planeNormal:[0, 0, -1], pointOnPlane:[0,0,0]}, floor, null);
        // floorCollider.callback = function (dat) {
        //     // updateReadout('A', dat.POI);
        //     // updateReadout('B', dat.collisionPoint);
        //     /* POI (aka Point Of Interest) represents the distance along the ray vector that the collision was found.
        //        If it's positive, that means the collision occurred *behind* the controller, in other words the controller
        //        is facing *away* from the floor so we make the cursor invisible.
        //        When POI is negative that means the controller is facing towards the object of collision.
        //        Don't ask me why it's that way round, my grasp of the math involved is tenuous.
        //     */
        //     /* TODO consider clamping the cursor pos to the edges of the floor */
        //     var c = scene.getObjectByLabel('cursor');
        //     if (dat.POI < 0) {
        //         c.hidden = false;
        //         c.pos.x = dat.collisionPoint[0];
        //         c.pos.y = dat.collisionPoint[1];
        //         c.pos.z = dat.collisionPoint[2];
        //     }
        //     else {
        //         c.hidden = true;
        //     }
        // }
        // scene.addObject(floor);
        
        /* Build the raft.
           For room-scale apps, the Raft is the piece of floor that the player stands on, with bounds equal to the 
           player's pre-defined play area. It's usually worthwhile to show this visually.
           In the Carnival framework, our standard way of letting the player move further than their floor space is
           to relocate them and the raft via teleportation.
        */
        // var stageExtent = {
        //     x: scene.stageParams.sizeX / 2,
        //     z: scene.stageParams.sizeZ / 2
        // };
        // console.log(scene.stageParams);
        // scene.addObject(new FCShapes.WallShape(
        //     {x: 0, z: 0, y: 0},
        //     {minX: -1*stageExtent.x, maxX: stageExtent.x, minY: -1*stageExtent.z, maxY: stageExtent.z},
        //     {x:DEG(270), y:0, z:0},
        //     {label: 'raft', materialLabel: 'concrete', textureLabel: 'royalblue', segmentsX: 1, segmentsY: 1}
        // ));
        
        /* === === === Controllers === === === */
        
        /* Button handler for the controllers. 
           The default button handler does these things:
           - Grip button: Teleport to cursor location
           - Menu button: Toggle showing/hiding the lights
           - Trigger: Dump to console the current location of the controller whose trigger was pressed
           - Any button: Output button status to console
        
           Buttons for Vive controller are - 0: trackpad, 1: trigger 2: grip, 3: menu
           Statuses are: pressed, released, up, held
           up means button is not pressed.
           pressed means the button transitioned from up to down.
           released means the button transitioned from down to up.
           held means the button started down and stayed down
        
           If the trackpad is involved, sector will be one of n, ne, e, se, s, sw, w, nw, center
           If you need more precision than that, consider writing a custom handler :)
           Buttonhandlers are called once per anim frame. 
        */
        var buttonHandler = function (gamepadIdx, btnIdx, btnStatus, sector, myButton, extra) {
            if (btnStatus != 'up') {
                /* Print status of buttons */
                console.log('Button idx', btnIdx, 'on controller', gamepadIdx, 'was', btnStatus); // << this gets annoying pretty quickly!
                
                /* Print trackpad sector info */
                if (btnIdx == 0) {
                    console.log('Sector', sector);
                }
                /* Dump controller location on trigger */
                else if (btnIdx == 1 && btnStatus == 'pressed') {
                    console.log(scene.playerSpatialState.hands[gamepadIdx].pos);
                }
                /* Teleport user */
                else if (btnIdx == 2 && btnStatus == 'pressed') {
                    scene.teleportUserToCursor();
                }
                /* Show/hide the scene lights */
                else if (btnIdx == 3 && btnStatus == 'pressed') {
                    scene.showLights();
                }
            }
        };
        
        /* Building the controllers.
           A representation of a controller consists of several distinct pieces of visual chrome, and
           some functions that handle the following tasks:
               - mapping movement of the real-world controller onto the position and orientation of the models
               - interpreting presses of buttons
               - (controller 0) projecting a ray from the controller which "collides" with the floor to determine cursor location
        */
        
        /* Build a pair of simple trackers and add them to the scene for later re-use. */
        scene.trackers.a = FCUtil.makeGamepadTracker(scene, 0, null);
        scene.trackers.b = FCUtil.makeGamepadTracker(scene, 1, null);
                
        /* Factory function for controllers
           primaryBehaviours are specific behaviors that will only be applied to the first item of chrome.
           basicTracker is a simple tracker that just moves the chrome around.
        */
        var buildController = function (chromeMeshes, texLabel, basicTracker, primaryBehaviours) {
            var p = {
                textureLabel: texLabel, materialLabel: 'matteplastic', groupLabel: 'controllerTrackers'
            };
            for (var i = 0; i < chromeMeshes.length; i++) {
                var o = new FCShapes.MeshShape(chromeMeshes[i], _hidden(), {scale:1}, null, p);
                if (i==0) {
                    for (var j = 0; j < primaryBehaviours.length; j++) {
                        o.behaviours.push(primaryBehaviours[j]);
                    }
                }
                else {
                    o.behaviours.push(basicTracker);
                }
                scene.addObject(o);
            }
        }
        
        /* Get the bits and pieces ready for building the controllers */
        var chromeMeshes = (function (L) {var out=[]; for (var i=0; i<L.length; i++) {out.push(scene.meshes['controller_'+L[i]]);} return out;})
            (['body', 'button_menu', 'button_sys', 'trigger', 'trackpad', 'grip_l', 'grip_r']);        
        var c0ButtonHandlingTracker = FCUtil.makeGamepadTracker(scene, 0, buttonHandler);
        var c0Projector = FCUtil.makeControllerRayProjector(scene, 0, [floorCollider]);
        var c1ButtonHandlingTracker = FCUtil.makeGamepadTracker(scene, 1, buttonHandler);
        
        buildController(chromeMeshes, 'seagreen', scene.trackers.a, [c0ButtonHandlingTracker, c0Projector]);
        buildController(chromeMeshes, 'royalblue', scene.trackers.b, [c1ButtonHandlingTracker]);
        
        /* === === === Putting some things in the scene === === === */
        /* Let's add some text to the scene by:
           - loading meshes representing letters and other typographical characters (aka glyphs) 
           - then creating drawable objects from those meshes
           - then adding the drawables to the scene.
        */  
        
        /* Function for adding example text, made up of glyphs loaded from meshes */
        var showText = function (textStr, basePos, baseOri, scale) {
            scale = scale || 1.0;
            var rotQuat = quat.create();
            quat.rotateX(rotQuat, rotQuat, baseOri.x);
            quat.rotateY(rotQuat, rotQuat, baseOri.y);
            quat.rotateZ(rotQuat, rotQuat, baseOri.z);
            var transVec = vec3.fromValues(basePos.x, basePos.y, basePos.z);
            var mat = mat4.create();
            mat4.fromRotationTranslation(mat, rotQuat, transVec);
            
            var glyphPromises = [];
            var xOffset = 0;
            for (var i=0; i<textStr.length; i++) {
                var glyph;
                var meshPath = '//meshbase.meta4vr.net/_typography/lato-bold/glyph_'+textStr.charCodeAt(i)+'.obj';
                glyphPromises.push(FCShapeUtils.loadMesh(meshPath));
            }
            Promise.all(glyphPromises).then(function (meshes) {
                for (var i=0; i<meshes.length; i++) {
                    var mesh = meshes[i];
                    var meshInfo = FCMeshTools.analyseMesh(mesh);
                    glyph = new FCShapes.MeshShape(mesh, {x:xOffset, y:0, z:0}, {scale:scale}, null,
                                {materialLabel:'matteplastic', groupLabel:'letters'});
                    glyph.inheritedMatrix = mat;
                    scene.addObject(glyph);
                    xOffset += meshInfo.maxX*1.2*scale;
                
                }
            });
        }
        
        showText('#virtualreality', {x:2, y:0.3, z:3}, {x:0, y:DEG(180), z:0});
        showText('/meta4vr', {x:-1.7, y:0.3, z:-3}, {x:0, y:0, z:0});
        
        /* Add a facebook icon from a FontAwesome glyph mesh. */
        /* The entire FontAwesome v4.6.3 glyphset is on meshbase, to get the hexcodes google "fontawesome cheat sheet" */
        FCShapeUtils.loadMesh('//meshbase.meta4vr.net/_typography/fontawesome/glyph_'+0xf230+'.obj')
        .then(function (mesh) {
            var fbIcon = new FCShapes.MeshShape(mesh, {x:-2.7, y:0.3, z:-3}, {scale:1.0}, null, {materialLabel:'matteplastic'});
            scene.addObject(fbIcon);
        });
        
    }

    return Scene;
})();
