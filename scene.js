
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
        scene.coreComponents = new $$.component.ComponentLibrary('http://components.meta4vr.net');
        // scene.myComponents = new $$.component.ComponentLibrary('/_components');
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
           in scene.trackers. (This will happen in sceneSetup().)
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
    Scene.prototype.switchLights = function (state) {
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
        console.log('Setting up scene...');
        
        let $xyz = (x, y, z) => ({x:x, y:y, z:z});
        let $hidden = () => $xyz(0, -10, 0);            /* For when you want to hide something under the floor */
        let $colorTex = l => $$.colors[l].asTexture();
        let $addToScene = o => scene.addObject(o);
        let $readout = (k, val) => document.querySelector(`#readout${k}`).value = val;

        let $clib = scene.coreComponents;


        /* Build the floor. */
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
        
        
        /* Build the Raft. */
        /*  For room-scale apps, the Raft is the piece of floor that the player stands on, with bounds equal to the 
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
        /*  Behaviors are just functions that accept a drawable object and the current time in milliseconds.
            Every drawable in the scene has its behaviors called on every frame.
        */
        cursor.addBehavior(function (drawable, timePoint) {
            drawable.currentOrientation = $xyz(0.0, Math.PI*2*(timePoint/7000), 0.0);
        });
        cursor.prepare().then($addToScene);

        
        /* === === === CONTROLLERS === === === */
        
        /*  Controllers need a few things to make them work.
            We will build trackers, a button handler, and a collider; and then we will construct a controller component which 
            contains its own chrome, and associate these things with it.
        */
        
        
        /* Build a pair of simple trackers and add them to the scene for later re-use. */
        /*	Trackers are behaviors that cause an object to track the movements of a controller. 
            The most obvious use for this is to display the controllers themselves in the simulation; or,
            more generally, the location of the user's hands.
        */
        let $ctrl = $clib.componentClass('vivecontroller');
        scene.trackers.a = $ctrl.makeTracker(scene, 0, null);
        scene.trackers.b = $ctrl.makeTracker(scene, 1, null);
     

        /* Now let's configure the buttons on the controller. */
        /*	To do this, we use the utility function makeButtonHandler to generate a behavior which will, in each rendered frame, test the button states against a list 
        of actions. The behavior will pass a structure of button states to the [trigger] function and, if trigger returns true, it will then call the [action]
        function with the same set of button states.
        Later we will attach this behavior to the controller component. Technically we can put it anywhere - since the gamepad data is global, and any scene object
        can have behaviors attached - but attaching it to the controller is just a convention, but a sensible one.

        The button structure for a Vive controller has the following buttons:
        - grip
        - menu
        - trigger
        - trackpad

        And these buttons all report these states:
        - up			button is currently not being pressed
        - down			button is currently being pressed
        - pressed		button has transitioned from up to down
        - released		button has transitioned from down to up
        - held			button is being held down

        The trackpad has some extra functionality.
        - touched		true if the player's finger or other appendage is touching the trackpad
        - segment		a simplistic way of checking where the user is touching, one of n / ne / e / se / s / sw / w / nw / center
        - sector		a more detailed, and configurable way of checking user touchpoint. Reports one of 12 (by default) sectors from 0-11
        - angle			the angle, in radians, relative to the +ve X axis, of the player touchpoint
        - radius		the distance of the player's touchpoint from the origin (center) of the trackpad

        */
        let c0ButtonHandler = $ctrl.makeButtonHandler(0, [
            {trigger: c => c.buttons.grip.pressed, action: c => scene.teleportUserToCursor()},
            {trigger: c => c.buttons.menu.pressed, action: c => scene.switchLights()},
            {trigger: c => c.buttons.trackpad.touched, action: c => {let t = c.buttons.trackpad; $readout('A', t.angle); $readout('B', t.radius); $readout('C', t.sector); $readout('D', t.segment);}},
            {trigger: c => c.buttons.trackpad.pressed, action: c => window.CONTROLLERINFO = c}
        ]);


        /* Now let's set up a collider. */
        /* We will project a virtual ray from the controller and test it against a collider attached to the floor. */
        /* This lets us determine where the player is pointing their controller; ie, the cursor location. */
        /* We can get the floor component to provide us a suitable collider. */
        /* The collider fires callbacks when a collision is detected. */
        let floorCollider = floor.getCollider('planar');

        /* This callback simply sets the location of the cursor to the point where the ray collided with the floor. */
        let moveCursorToCollisionPoint = collision => {
            let cursor = scene.getObjectByLabel('cursor');
            if (collision.POI < 0) {
                cursor.drawable.hidden = false;
                cursor.drawable.pos.x = collision.collisionPoint[0];
                cursor.drawable.pos.y = collision.collisionPoint[1];
                cursor.drawable.pos.z = collision.collisionPoint[2];
            }
            else {
                cursor.hidden = true;
            }
        }
        floorCollider.callback = moveCursorToCollisionPoint;

        /* Next, we use some class methods of the controller component to build trackers and a ray projector. */
        /* The ray projector needs to know about all the colliders it is expected to test against. */
        var c0RayProjector = $ctrl.makeRayProjector(scene, 0, [floorCollider]);


        /* Now, bring these things together and fabricate the controllers. */
        let controllerCfgs = [
            {label: 'c0', 
            behaviors: [
                {function: scene.trackers.a, label: 'tracker'},
                {function: c0RayProjector, label: 'rayProjector'},
                {function: c0ButtonHandler, label: 'buttonHandler'}
            ], config: {
                mainTexture: $colorTex('seagreen'), altTexture: $colorTex('white'), gamepadIndex: 0
            }},
            {label: 'c1', 
            behaviors: [
                {function: scene.trackers.b, label: 'tracker'}
            ], config: {
                mainTexture: $colorTex('royalblue'), altTexture: $colorTex('white'), gamepadIndex: 1
            }}
        ];
        controllerCfgs.forEach(cfg => ($clib.new('vivecontroller')(cfg)).prepare().then($addToScene));



        /* === === === PUTTING SOME THINGS IN THE SCENE === === === */
        /*  Let's use components to add some text to the scene.
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
     
        // /* TODO this will be an alternative way of building the FB icon as soon as I can add child components */
        // let fbicon = $clib.new('urlmesh')({
        //     label: 'fbLogo',
        //     draw: {
        //         position: $xyz(1, 1, 3),
        //         orientation: $xyz(0, 0, 0),
        //         color: '#2255ff'
        //     },
        //     config: {
        //         meshURL: '//meshbase.meta4vr.net/_typography/fontawesome/glyph_'+0xf230+'.obj'
        //     }
        // });
        // fbicon.prepare().then($addToScene);
     
    }

    return Scene;
})();
