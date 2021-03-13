import * as THREE from 'three';
import { lineVsAabb } from './util/Collisions.js';
import { vectorToAabbBoundary, vectorFromAabbBoundary } from './util/Aabbs.js';
import Orientation from './util/Orientation.js';
import { BoidBehavior } from './BoidBehaviors.js';

/**
 * After a boid is wrapped on the other side of the clipping AABB, it is brought
 * away from each border by this distance.
 */
const CLIPPING_EPSILON = 0.025;

const INFINITE_BOX = new THREE.Box3(
    new THREE.Vector3(-Infinity, -Infinity, -Infinity),
    new THREE.Vector3(Infinity, Infinity, Infinity)
);

export class BoidOptions {
    /**
     * @param {THREE.Mesh} mesh
     */
    constructor(mesh) {
        this.initialPosition = new THREE.Vector3(0, 0, 0);
        this.mesh = mesh;
        this.clippingBox = INFINITE_BOX;
        this.behavior = new BoidBehavior();
        this.mass = 1;
        this.initialVelocity = new THREE.Vector3(1, 0, 0);
        this.minVelocity = 0;
        this.maxVelocity = 1;
        this.size = 1;
    }

    setVelocity(initialVelocity, minVelocity = 0, maxVelocity = 1) {
        this.initialVelocity = initialVelocity;
        this.minVelocity = minVelocity;
        this.maxVelocity = maxVelocity;

        return this;
    }

    setBehavior(behavior, size, mass = 1, clippingBox = INFINITE_BOX) {
        this.behavior = behavior;
        this.size = size;
        this.mass = mass;
        this.clippingBox = clippingBox;

        return this;
    }

    setInitialPosition(position) {
        this.initialPosition.copy(position);

        return this;
    }
}

export class Boid {
    /**
     * @param {BoidOptions} options
     */
    constructor(options) {
        this.position = options.initialPosition;
        this.velocity = options.initialVelocity;

        this.mesh = options.mesh;
        this.mesh.position.copy(this.position);

        this.clippingBox = options.clippingBox;
        this.behavior = options.behavior;
        this.mass = options.mass;
        this.maxVelocity = options.maxVelocity;
        this.minVelocity = options.minVelocity;
        this.size = options.size;

        this.orientation = new Orientation(
            options.initialVelocity.clone(),
            new THREE.Vector3(0, 1, 0)
        );
        this.alignWithVelocity();
    }

    alignWithVelocity() {
        if (this.velocity.length() > this.minVelocity) {
            this.orientation.update(this.velocity.clone());
            this.mesh.lookAt(this.position.clone().add(this.orientation.forward));
            this.mesh.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        }
    }

    /**
     * @param {Number} dt
     */
    update(dt) {
        const dtSeconds = dt * 0.001;

        // Wrap the boid on the the side in case it gets out of the clipping
        // box.
        if (
            vectorToAabbBoundary(this.position, this.clippingBox).length() > 0 &&
            !this.clippingBox.containsPoint(this.position)
        ) {
            const ray = new THREE.Ray(this.position.clone(), this.velocity.clone());
            const intersectionPoints = lineVsAabb(ray, this.clippingBox);
            const intersectionPointsCount = intersectionPoints.length;

            if (intersectionPointsCount === 0) {
                return;
            }

            this.position
                .copy(
                    intersectionPoints[intersectionPointsCount - 1].point.clamp(
                        this.clippingBox.min,
                        this.clippingBox.max
                    )
                )
                .add(vectorFromAabbBoundary(this.position, this.clippingBox, CLIPPING_EPSILON));
        }

        this.behavior.update(this);
        const steeringForce = this.behavior.force;

        this.velocity
            .add(steeringForce.divideScalar(this.mass).multiplyScalar(dtSeconds))
            .clampLength(0, this.maxVelocity);

        this.alignWithVelocity();

        this.position.add(this.velocity.clone().multiplyScalar(dtSeconds));
        this.mesh.position.copy(this.position);
    }
}
