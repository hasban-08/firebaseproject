import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase";
import "./ComponentsCss/CreatePost.css";

import {
    addDoc,
    collection,
    serverTimestamp
} from "firebase/firestore";

function CreatePost() {

    const navigate = useNavigate();

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [image, setImage] = useState("");
    const [preview, setPreview] = useState("");
    const [loading, setLoading] = useState(false);

    const handleImage = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setImage(reader.result);
            setPreview(reader.result);
        };
        reader.readAsDataURL(file);
    };

    const handlePost = async () => {
        if (description.trim() === "") {
            alert("Please write something.");
            return;
        }
        try {
            const docRef = await addDoc(collection(db, "posts"), {
                title: title,
                description: description,
                username: auth.currentUser.displayName,
                email: auth.currentUser.email,
                photoURL: auth.currentUser.photoURL,
                userId: auth.currentUser.uid,
                createdAt: serverTimestamp()
            });
            if (image) {
                localStorage.setItem("postImage_" + docRef.id, image);
            }
            alert("Post Added Successfully");
            setTitle("");
            setDescription("");
            setImage("");
            setPreview("");
            document.getElementById("postImage").value = "";
        } catch (error) {
            console.log(error);
            alert(error.message);
        }
    };

    return (

        <div className="cp-wrapper">

            <h3 className="cp-title">
                Create New Post
            </h3>

            <div className="cp-card">

                <div className="cp-field-group">
                    <label className="cp-label">Post Title</label>
                    <input
                        type="text"
                        className="cp-input"
                        placeholder="Enter Post Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                    />
                </div>

                <div className="cp-field-group">
                    <label className="cp-label">What's on your mind?</label>
                    <textarea
                        className="cp-input cp-textarea"
                        rows="5"
                        placeholder="Write your post here..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="cp-field-group">
                    <label className="cp-label">Attach Image</label>
                    <label className="cp-file-label">
                        <span className="cp-file-icon">🖼️</span>
                        <span className="cp-file-text">
                            {image ? "Image Selected ✓" : "Choose an image..."}
                        </span>
                        <input
                            id="postImage"
                            type="file"
                            className="cp-file-hidden"
                            accept="image/*"
                            onChange={handleImage}
                        />
                    </label>
                </div>

                {preview && (
                    <div className="cp-preview">
                        <img
                            src={preview}
                            alt="Preview"
                            className="cp-preview-img"
                            style={{
                                maxHeight: "300px",
                                objectFit: "cover"
                            }}
                        />
                    </div>
                )}

                <button
                    className={`cp-btn ${loading ? "cp-btn-loading" : ""}`}
                    onClick={handlePost}
                    disabled={loading}
                >
                    {loading ? (
                        <>
                            <span className="cp-spinner" />
                            Posting...
                        </>
                    ) : (
                        "Create Post"
                    )}
                </button>

            </div>

        </div>

    );
}

export default CreatePost;