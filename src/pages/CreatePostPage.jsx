import Header from "../components/Header";
import CreatePost from "../components/Createpost";
import "./css/CreatePostPage.css";

function CreatePostPage() {

    return (
        <>
            <Header />

            <div className="createpost-wrapper">

                <div className="createpost-container">

                    <CreatePost />

                </div>

            </div>
        </>
    );
}

export default CreatePostPage;